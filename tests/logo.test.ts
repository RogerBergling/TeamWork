import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readLogoDataUrl } from '../src/main/logo-file'
import {
  isLogoPathAllowed,
  MAX_LOGO_BYTES,
  resolveLogoPath
} from '../src/main/logo-path'

const directories: string[] = []

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'teamwork-logo-'))
  directories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('logo file policy', () => {
  it('allows only the saved logo or a path returned by the file dialog', () => {
    expect(isLogoPathAllowed('/home/alice/logo.png', '/home/alice/logo.png', [])).toBe(true)
    expect(isLogoPathAllowed('/home/alice/picked.png', '', ['/home/alice/picked.png'])).toBe(true)
    expect(isLogoPathAllowed('/etc/passwd', '/home/alice/logo.png', [])).toBe(false)
    expect(isLogoPathAllowed('/home/alice/../alice/logo.png', '/home/alice/logo.png', [])).toBe(
      true
    )
    expect(isLogoPathAllowed('', '', [])).toBe(false)
    expect(resolveLogoPath('   ')).toBeNull()
  })

  it('reads a regular image file as a data URL', async () => {
    const directory = temporaryDirectory()
    const path = join(directory, 'logo.png')
    writeFileSync(path, Buffer.from([0x89, 0x50, 0x4e, 0x47]))

    const data = await readLogoDataUrl(path)
    expect(data).toBe('data:image/png;base64,iVBORw==')
  })

  it('rejects directories, symlinks, unsupported extensions and oversized files', async () => {
    const directory = temporaryDirectory()
    const folder = join(directory, 'folder')
    mkdirSync(folder)
    expect(await readLogoDataUrl(folder)).toBeNull()

    const target = join(directory, 'target.png')
    writeFileSync(target, Buffer.from([1, 2, 3]))
    const link = join(directory, 'link.png')
    symlinkSync(target, link)
    expect(await readLogoDataUrl(link)).toBeNull()

    const text = join(directory, 'logo.txt')
    writeFileSync(text, 'not an image')
    expect(await readLogoDataUrl(text)).toBeNull()

    const large = join(directory, 'large.png')
    writeFileSync(large, '')
    truncateSync(large, MAX_LOGO_BYTES + 1)
    expect(await readLogoDataUrl(large)).toBeNull()
    expect(await readLogoDataUrl(join(directory, 'missing.png'))).toBeNull()
  })
})
