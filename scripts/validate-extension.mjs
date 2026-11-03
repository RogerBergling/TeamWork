import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()
const dist = resolve(root, 'browser-extension', 'dist')
const source = resolve(root, 'browser-extension')
const manifestPath = resolve(dist, 'manifest.json')

if (!existsSync(manifestPath)) {
  throw new Error('Extension dist is missing. Run: npm run extension:build')
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const sourceManifest = JSON.parse(await readFile(resolve(source, 'manifest.json'), 'utf8'))
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))

function withoutUpdateUrl(value) {
  const clone = structuredClone(value)
  delete clone.update_url
  return clone
}

if (JSON.stringify(withoutUpdateUrl(manifest)) !== JSON.stringify(withoutUpdateUrl(sourceManifest))) {
  throw new Error('browser-extension/dist/manifest.json is stale; rebuild the extension')
}
if (manifest.update_url !== undefined) {
  let updateUrl
  try {
    updateUrl = new URL(manifest.update_url)
  } catch {
    throw new Error('The extension update_url must be an absolute HTTPS URL')
  }
  if (updateUrl.protocol !== 'https:' || !updateUrl.hostname) {
    throw new Error('The extension update_url must be an absolute HTTPS URL')
  }
  if (updateUrl.username || updateUrl.password) {
    throw new Error('The extension update_url must not contain credentials')
  }
}
if (manifest.manifest_version !== 3) {
  throw new Error('The extension must use Manifest V3')
}
if (!/^\d+\.\d+\.\d+$/.test(manifest.version ?? '')) {
  throw new Error(`Invalid extension version: ${manifest.version}`)
}
if (manifest.version !== packageJson.version) {
  throw new Error(
    `Extension version ${manifest.version} does not match package version ${packageJson.version}`
  )
}

const referenced = new Set()
referenced.add(manifest.background?.service_worker)
referenced.add(manifest.action?.default_popup)
referenced.add(manifest.options_ui?.page)
referenced.add(manifest.storage?.managed_schema)
for (const icon of Object.values(manifest.icons ?? {})) referenced.add(icon)
for (const icon of Object.values(manifest.action?.default_icon ?? {})) referenced.add(icon)
for (const script of manifest.content_scripts ?? []) {
  for (const file of script.js ?? []) referenced.add(file)
  for (const file of script.css ?? []) referenced.add(file)
}

for (const file of referenced) {
  if (typeof file !== 'string' || !file) {
    throw new Error('Manifest contains an empty file reference')
  }
  const path = resolve(dist, file)
  if (!existsSync(path)) throw new Error(`Manifest references missing file: ${file}`)
  const info = await stat(path)
  if (info.size === 0) throw new Error(`Manifest references empty file: ${file}`)
}

const schema = JSON.parse(await readFile(resolve(dist, manifest.storage.managed_schema), 'utf8'))
if (schema.type !== 'object' || !schema.properties) {
  throw new Error('Managed storage schema must be an object with properties')
}

const contentScripts = manifest.content_scripts ?? []
if (contentScripts.length === 0) {
  throw new Error('No content scripts are declared')
}
if (!manifest.optional_host_permissions?.includes('https://*/*')) {
  throw new Error('All-site interception requires an optional HTTPS host permission')
}

console.log(
  `Extension valid: ${manifest.name} ${manifest.version}, ` +
    `${referenced.size} referenced files, ` +
    `${contentScripts.length} content script group(s)`
)
