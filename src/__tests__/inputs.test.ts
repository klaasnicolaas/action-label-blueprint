import { beforeEach, describe, expect, it, vi } from 'vitest'

const coreMocks = vi.hoisted(() => ({
  getInput: vi.fn(),
  getBooleanInput: vi.fn(),
}))

vi.mock('@actions/core', () => coreMocks)

import {
  getInputs,
  parseMode,
  parsePruneIgnore,
  parsePruneStrategy,
  parseRepositories,
} from '../inputs.js'

describe('parseMode', () => {
  it.each(['sync', 'preview', 'check'] as const)('accepts %s mode', (mode) => {
    expect(parseMode(mode, false)).toBe(mode)
  })

  it('defaults to sync mode', () => {
    expect(parseMode('', false)).toBe('sync')
  })

  it('maps the legacy dry-run input to preview mode', () => {
    expect(parseMode('sync', true)).toBe('preview')
  })

  it('keeps an explicit check mode when legacy dry-run is enabled', () => {
    expect(parseMode('check', true)).toBe('check')
  })

  it('rejects unsupported modes', () => {
    expect(() => parseMode(' APPLY ', false)).toThrow(
      'Invalid mode "apply": expected sync, preview, or check',
    )
  })
})

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

describe('parsePruneIgnore', () => {
  it('parses comma and newline separated patterns case-insensitively', () => {
    expect(
      parsePruneIgnore(
        'dependencies\n release:* , GitHub-Actions\nDEPENDENCIES',
      ),
    ).toEqual(['DEPENDENCIES', 'release:*', 'GitHub-Actions'])
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
        'prune-ignore': 'dependencies\nrelease:*',
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
      pruneStrategy: 'delete',
      pruneIgnore: ['dependencies', 'release:*'],
      mode: 'sync',
    })
  })

  it('reads archive pruning from the action input', () => {
    coreMocks.getInput.mockImplementation((name: string) => {
      const values: Record<string, string> = {
        'github-token': 'token',
        'labels-file': 'labels.yml',
        'prune-strategy': 'archive',
      }
      return values[name] ?? ''
    })
    coreMocks.getBooleanInput.mockImplementation(
      (name: string) => name === 'prune',
    )

    expect(getInputs('owner/repo')).toMatchObject({
      prune: true,
      pruneStrategy: 'archive',
    })
  })
})

describe('parsePruneStrategy', () => {
  it.each(['delete', 'archive'] as const)('accepts %s pruning', (strategy) => {
    expect(parsePruneStrategy(strategy)).toBe(strategy)
  })

  it('defaults to delete for backwards compatibility', () => {
    expect(parsePruneStrategy('')).toBe('delete')
  })

  it('normalizes whitespace and casing', () => {
    expect(parsePruneStrategy(' ARCHIVE ')).toBe('archive')
  })

  it('rejects unsupported strategies', () => {
    expect(() => parsePruneStrategy(' KEEP ')).toThrow(
      'Invalid prune-strategy "keep": expected delete or archive',
    )
  })
})
