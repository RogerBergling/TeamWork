import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const html = readFileSync(join(process.cwd(), 'src', 'renderer', 'index.html'), 'utf8')
const csp = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1] ?? ''

describe('renderer content security policy', () => {
  it('does not allow inline scripts', () => {
    expect(csp).toContain("script-src 'self'")
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/)
  })

  it('narrows connections to self and loopback development servers', () => {
    const connect = csp.match(/connect-src ([^;]+)/)?.[1] ?? ''
    expect(connect).toContain("'self'")
    expect(connect).not.toContain('https:')
    expect(connect).not.toMatch(/(^|\s)http:(\s|$)/)
    expect(connect).toContain('http://localhost:*')
    expect(connect).toContain('ws://localhost:*')
    expect(connect).toContain('http://127.0.0.1:*')
  })

  it('locks down objects, base URLs and framing', () => {
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
  })
})
