import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const workflows = ['release.yml', 'build.yml'].map((name) => ({
  name,
  content: readFileSync(join(root, '.github', 'workflows', name), 'utf8')
}))

const actionPattern = /^\s*(?:-\s+)?uses:\s+(\S+)/gm

describe('GitHub workflows', () => {
  for (const workflow of workflows) {
    it(`${workflow.name} pins every action to a full commit SHA`, () => {
      const actions = [...workflow.content.matchAll(actionPattern)].map((match) => match[1])
      expect(actions.length).toBeGreaterThan(0)
      for (const action of actions) {
        expect(action).toMatch(/^[^@\s]+@[0-9a-f]{40}$/)
      }
    })

    it(`${workflow.name} disables persisted checkout credentials`, () => {
      expect(workflow.content).toMatch(
        /uses: actions\/checkout@[0-9a-f]{40}[^\n]*\n\s+with:\s*\n\s+persist-credentials: false/
      )
    })
  }

  it('scopes contents: write to the release job only', () => {
    const release = workflows.find((workflow) => workflow.name === 'release.yml')!.content
    const [beforeJobs, jobs] = release.split(/\njobs:\s*\n/)
    expect(beforeJobs).not.toMatch(/contents:\s*write/)
    expect(jobs).toMatch(/release:[\s\S]*?permissions:\s*\n\s+contents: write/)

    const build = workflows.find((workflow) => workflow.name === 'build.yml')!.content
    expect(build).not.toMatch(/contents:\s*write/)
  })
})
