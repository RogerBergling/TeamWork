import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import sharp from 'sharp'

const source = resolve('src/renderer/assets/logo.svg')
const buildDir = resolve('build')
const png = resolve(buildDir, 'icon.png')

await mkdir(buildDir, { recursive: true })
await sharp(source).resize(512, 512).png({ compressionLevel: 9 }).toFile(png)
await copyFile(source, resolve(buildDir, 'icon.svg'))

const metadata = await sharp(png).metadata()
console.log(`Generated ${png} (${metadata.width}x${metadata.height})`)
