import { copyFile, mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import sharp from 'sharp'

const root = process.cwd()
const source = resolve(root, 'browser-extension')
const src = resolve(source, 'src')
const dist = resolve(source, 'dist')

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
