/**
 * Renders the Orbit brand SVG into every raster size the app + installer need.
 *   node scripts/generate-icons.mjs
 */
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = join(root, 'build')
const resourcesDir = join(root, 'resources')

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
const PNG_SIZES = [16, 32, 64, 128, 256, 512, 1024]

async function render(svg, size) {
  return sharp(Buffer.from(svg), { density: 512 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer()
}

async function main() {
  await mkdir(buildDir, { recursive: true })
  await mkdir(join(resourcesDir, 'icons'), { recursive: true })

  const svg = await readFile(join(buildDir, 'icon.svg'), 'utf8')

  for (const size of PNG_SIZES) {
    const buf = await render(svg, size)
    await writeFile(join(resourcesDir, 'icons', `orbit-${size}.png`), buf)
    if (size === 512) await writeFile(join(buildDir, 'icon.png'), buf)
    if (size === 256) await writeFile(join(resourcesDir, 'icon.png'), buf)
  }

  const icoBuffers = []
  for (const size of ICO_SIZES) icoBuffers.push(await render(svg, size))
  const ico = await pngToIco(icoBuffers)
  await writeFile(join(buildDir, 'icon.ico'), ico)
  await writeFile(join(resourcesDir, 'icon.ico'), ico)

  console.log(`Generated ${PNG_SIZES.length} PNGs and icon.ico (${ICO_SIZES.join(', ')})`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
