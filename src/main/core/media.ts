import { net, protocol } from 'electron'
import { pathToFileURL } from 'node:url'
import { resolve, sep } from 'node:path'
import { paths } from './paths'
import { log } from './logger'

export const MEDIA_SCHEME = 'orbit-media'

/**
 * Renderer-safe URL for a file on disk. Only paths inside the launcher's own
 * data root are ever served, so a malicious mod cannot make the UI read
 * arbitrary files.
 */
export function mediaUrl(absolutePath: string, cacheKey?: string | number): string {
  const encoded = Buffer.from(absolutePath, 'utf8').toString('base64url')
  const suffix = cacheKey === undefined ? '' : `?v=${encodeURIComponent(String(cacheKey))}`
  return `${MEDIA_SCHEME}://file/${encoded}${suffix}`
}

export function registerMediaProtocolPrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: false, stream: true }
    }
  ])
}

function isInsideDataRoot(target: string): boolean {
  const root = resolve(paths.dataRoot)
  const candidate = resolve(target)
  return candidate === root || candidate.startsWith(root + sep)
}

export function registerMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      const encoded = url.pathname.replace(/^\//, '')
      const filePath = Buffer.from(decodeURIComponent(encoded), 'base64url').toString('utf8')

      if (!isInsideDataRoot(filePath)) {
        log.warn('media', `Blocked a request for a path outside the data root: ${filePath}`)
        return new Response('Forbidden', { status: 403 })
      }

      return await net.fetch(pathToFileURL(filePath).toString())
    } catch (err) {
      log.warn('media', 'Could not serve media request', err)
      return new Response('Not found', { status: 404 })
    }
  })
}
