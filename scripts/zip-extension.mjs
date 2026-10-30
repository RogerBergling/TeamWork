import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()
const dist = resolve(root, 'browser-extension', 'dist')
if (!existsSync(resolve(dist, 'manifest.json'))) {
  throw new Error('Build the extension first with: npm run extension:build')
}

const manifest = JSON.parse(await readFile(resolve(dist, 'manifest.json'), 'utf8'))
const releaseDir = resolve(root, 'release')
await mkdir(releaseDir, { recursive: true })
const target = resolve(releaseDir, `TeamWork-Browser-Extension-${manifest.version}.zip`)
await rm(target, { force: true })

try {
  execFileSync('zip', ['-r', '-q', target, '.'], { cwd: dist, stdio: 'inherit' })
} catch (error) {
  throw new Error(
    `Could not create the extension zip. Install the "zip" command or package the contents of ${dist} manually.`,
    { cause: error }
  )
}

console.log(`Created ${target}`)
