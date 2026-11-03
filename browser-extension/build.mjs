import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import sharp from 'sharp'

const root = process.cwd()
const source = resolve(root, 'browser-extension')
const src = resolve(source, 'src')
const dist = resolve(source, 'dist')
const manifestPath = resolve(source, 'manifest.json')

await rm(dist, { recursive: true, force: true })
await mkdir(resolve(dist, 'icons'), { recursive: true })

await build({
  entryPoints: {
    background: resolve(src, 'background.ts'),
    content: resolve(src, 'content.ts'),
    options: resolve(src, 'options.ts'),
    popup: resolve(src, 'popup.ts'),
    interstitial: resolve(src, 'interstitial.ts')
  },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome110'],
  outdir: dist,
  logLevel: 'info',
  legalComments: 'none'
})

for (const file of ['manifest.json', 'schema.json']) {
  if (file === 'manifest.json') {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const updateUrl = process.env.EXTENSION_UPDATE_URL?.trim()
    if (updateUrl) {
      let parsed
      try {
        parsed = new URL(updateUrl)
      } catch {
        throw new Error('EXTENSION_UPDATE_URL must be an absolute HTTPS URL')
      }
      if (parsed.protocol !== 'https:' || !parsed.hostname) {
        throw new Error('EXTENSION_UPDATE_URL must be an absolute HTTPS URL')
      }
      if (parsed.username || parsed.password) {
        throw new Error('EXTENSION_UPDATE_URL must not contain credentials')
      }
      manifest.update_url = updateUrl
      await writeFile(
        resolve(dist, 'manifest.json'),
        `${JSON.stringify(manifest, null, 2)}\n`,
        { mode: 0o644 }
      )
    } else {
      await copyFile(manifestPath, resolve(dist, 'manifest.json'))
    }
    continue
  }
  await copyFile(resolve(source, file), resolve(dist, file))
}
for (const file of ['options.html', 'popup.html', 'interstitial.html', 'styles.css']) {
  await copyFile(resolve(src, file), resolve(dist, file))
}

const iconSource = resolve(root, 'build', 'icon.png')
for (const size of [16, 32, 48, 128]) {
  await sharp(iconSource)
    .resize(size, size)
    .png()
    .toFile(resolve(dist, 'icons', `icon${size}.png`))
}

console.log(`Built browser extension in ${dist}`)
