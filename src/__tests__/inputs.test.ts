import { beforeEach, describe, expect, it, vi } from 'vitest'

const coreMocks = vi.hoisted(() => ({
  getInput: vi.fn(),
  getBooleanInput: vi.fn(),
}))

vi.mock('@actions/core', () => coreMocks)

import { getInputs, parseRepositories } from '../inputs.js'

describe('parseRepositories', () => {
  it('uses the current repository by default', () => {
    expect(parseRepositories('', 'owner/current')).toEqual(['owner/current'])
  })

  it('parses comma and newline separated repositories and deduplicates them', () => {
    expect(
      parseRepositories(
        'owner/one, owner/two\nOWNER/ONE\nother/repository.js',
        '',
      ),
    ).toEqual(['OWNER/ONE', 'owner/two', 'other/repository.js'])
  })

  it('rejects invalid repository names', () => {
    expect(() => parseRepositories('missing-owner', '')).toThrow(
      'expected owner/repository',
    )
  })
})
describe('getInputs', () => {
  beforeEach(() => {
    coreMocks.getInput.mockReset()
    coreMocks.getBooleanInput.mockReset()
  })

  it('reads and parses action inputs', () => {
    coreMocks.getInput.mockImplementation((name: string) => {
      const values: Record<string, string> = {
        'github-token': 'token',
        'labels-file': 'labels.yml',
        repositories: 'owner/one,owner/two',
      }
      return values[name] ?? ''
    })
    coreMocks.getBooleanInput.mockImplementation(
      (name: string) => name === 'prune',
    )

    expect(getInputs('owner/default')).toEqual({
      token: 'token',
      labelsFile: 'labels.yml',
      repositories: ['owner/one', 'owner/two'],
      prune: true,
      dryRun: false,
    })
  })
})
