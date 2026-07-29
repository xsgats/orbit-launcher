import { createWriteStream } from 'node:fs'
import { dirname, join, normalize, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import archiver from 'archiver'
import yauzl, { type Entry, type ZipFile } from 'yauzl'
import { ensureDir, exists } from './fsx'

export interface ZipEntryInfo {
  fileName: string
  sizeBytes: number
  compressedSize: number
  isDirectory: boolean
  modifiedAt: number
}

function openZip(path: string): Promise<ZipFile> {
  return new Promise((resolvePromise, reject) => {
    yauzl.open(path, { lazyEntries: true, autoClose: false }, (err, zip) => {
      if (err || !zip) reject(err ?? new Error(`Could not open archive: ${path}`))
      else resolvePromise(zip)
    })
  })
}

function readEntryBuffer(zip: ZipFile, entry: Entry): Promise<Buffer> {
  return new Promise((resolvePromise, reject) => {
    zip.openReadStream(entry, (err, stream) => {
      if (err || !stream) return reject(err ?? new Error(`Could not read ${entry.fileName}`))
      const chunks: Buffer[] = []
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('error', reject)
      stream.on('end', () => resolvePromise(Buffer.concat(chunks)))
    })
  })
}

const isDirEntry = (entry: Entry): boolean => /[/\\]$/.test(entry.fileName)


async function eachEntry(
  path: string,
  visitor: (entry: Entry, read: () => Promise<Buffer>) => Promise<'continue' | 'stop'>
): Promise<void> {
  const zip = await openZip(path)
  try {
    await new Promise<void>((resolvePromise, reject) => {
      zip.on('entry', (entry: Entry) => {
        visitor(entry, () => readEntryBuffer(zip, entry))
          .then((signal) => {
            if (signal === 'stop') resolvePromise()
            else zip.readEntry()
          })
          .catch(reject)
      })
      zip.on('end', () => resolvePromise())
      zip.on('error', reject)
      zip.readEntry()
    })
  } finally {
    zip.close()
  }
}

export async function listZipEntries(path: string): Promise<ZipEntryInfo[]> {
  const out: ZipEntryInfo[] = []
  await eachEntry(path, async (entry) => {
    out.push({
      fileName: entry.fileName,
      sizeBytes: entry.uncompressedSize,
      compressedSize: entry.compressedSize,
      isDirectory: isDirEntry(entry),
      modifiedAt: entry.getLastModDate?.().getTime() ?? 0
    })
    return 'continue'
  })
  return out
}


export async function readZipEntry(path: string, entryName: string): Promise<Buffer | null> {
  let found: Buffer | null = null
  const wanted = entryName.toLowerCase()
  await eachEntry(path, async (entry, read) => {
    if (entry.fileName.toLowerCase() === wanted) {
      found = await read()
      return 'stop'
    }
    return 'continue'
  })
  return found
}


export async function readZipEntries(
  path: string,
  predicate: (fileName: string) => boolean
): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>()
  await eachEntry(path, async (entry, read) => {
    if (!isDirEntry(entry) && predicate(entry.fileName)) {
      out.set(entry.fileName, await read())
    }
    return 'continue'
  })
  return out
}

export interface ExtractOptions {

  filter?: (fileName: string) => boolean

  stripPrefix?: string
  onProgress?: (done: number, total: number, fileName: string) => void
  signal?: AbortSignal
}

export async function extractZip(path: string, destDir: string, options: ExtractOptions = {}): Promise<number> {
  const { filter, stripPrefix, onProgress, signal } = options
  const root = resolve(destDir)
  await ensureDir(root)

  const entries = await listZipEntries(path)
  const total = entries.filter((e) => !e.isDirectory).length
  let done = 0

  await eachEntry(path, async (entry, read) => {
    if (signal?.aborted) return 'stop'
    if (isDirEntry(entry)) return 'continue'

    let name = entry.fileName.replace(/\\/g, '/')
    if (stripPrefix) {
      if (!name.toLowerCase().startsWith(stripPrefix.toLowerCase())) return 'continue'
      name = name.slice(stripPrefix.length)
    }
    if (!name || (filter && !filter(name))) return 'continue'


    const target = resolve(root, normalize(name))
    if (target !== root && !target.startsWith(root + sep)) return 'continue'

    await ensureDir(dirname(target))
    const buffer = await read()
    await pipeline(
      (async function* () {
        yield buffer
      })(),
      createWriteStream(target)
    )

    done += 1
    onProgress?.(done, total, name)
    return 'continue'
  })

  return done
}

export interface ZipSource {

  path: string

  archivePath: string

  ignore?: string[]
}

export async function createZip(
  targetPath: string,
  sources: ZipSource[],
  extraFiles: { archivePath: string; content: string | Buffer }[] = []
): Promise<string> {
  await ensureDir(dirname(targetPath))

  return new Promise<string>((resolvePromise, reject) => {
    const output = createWriteStream(targetPath)
    const archive = archiver('zip', { zlib: { level: 6 } })

    output.on('close', () => resolvePromise(targetPath))
    output.on('error', reject)
    archive.on('warning', (err) => {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') reject(err)
    })
    archive.on('error', reject)
    archive.pipe(output)

    void (async () => {
      try {
        for (const source of sources) {
          if (!(await exists(source.path))) continue
          const { isDirectory } = await import('node:fs/promises').then(async (fs) => ({
            isDirectory: (await fs.stat(source.path)).isDirectory()
          }))
          if (isDirectory) {
            archive.glob('**/*', {
              cwd: source.path,
              dot: true,
              ignore: source.ignore ?? []
            }, { prefix: source.archivePath })
          } else {
            archive.file(source.path, { name: source.archivePath })
          }
        }
        for (const file of extraFiles) {
          archive.append(file.content, { name: file.archivePath })
        }
        await archive.finalize()
      } catch (err) {
        reject(err)
      }
    })()
  })
}


export async function readZipJson<T>(path: string, entryName: string): Promise<T | null> {
  const buffer = await readZipEntry(path, entryName)
  if (!buffer) return null
  try {
    return JSON.parse(buffer.toString('utf8')) as T
  } catch {
    return null
  }
}


export async function findZipEntry(
  path: string,
  predicate: (fileName: string) => boolean
): Promise<{ fileName: string; buffer: Buffer } | null> {
  let hit: { fileName: string; buffer: Buffer } | null = null
  await eachEntry(path, async (entry, read) => {
    if (!isDirEntry(entry) && predicate(entry.fileName)) {
      hit = { fileName: entry.fileName, buffer: await read() }
      return 'stop'
    }
    return 'continue'
  })
  return hit
}

export function joinArchivePath(...parts: string[]): string {
  return parts.filter(Boolean).join('/').replace(/\/+/g, '/')
}

export { join as joinPath }
