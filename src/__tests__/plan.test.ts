import { describe, expect, it } from 'vitest'
import { buildPlan, createPlanOutput } from '../plan.js'
import type { LabelChange, RepositorySync, SyncResult } from '../types.js'

const changes: LabelChange[] = [
  {
    kind: 'delete',
    name: 'zebra',
    current: {
      name: 'zebra',
      color: 'ABCDEF',
      description: 'Removed',
    },
  },
  {
    kind: 'update',
    name: 'renamed',
    previousName: 'legacy',
    current: {
      name: 'legacy',
      color: 'ffffff',
      description: 'Before rename',
    },
    label: {
      name: 'renamed',
      color: '000000',
      description: 'After rename',
      aliases: ['legacy'],
    },
  },
  {
    kind: 'unchanged',
    name: 'keep',
    current: {
      name: 'keep',
      color: '0E8A16',
      description: null,
    },
    label: {
      name: 'keep',
      color: '0e8a16',
      description: null,
      aliases: [],
    },
  },
  {
    kind: 'update',
    name: 'bug',
    previousName: 'bug',
    current: {
      name: 'bug',
      color: 'ffffff',
      description: 'Old description',
    },
    label: {
      name: 'bug',
      color: 'd73a4a',
      description: 'New description',
      aliases: [],
    },
  },
  {
    kind: 'create',
    name: 'addition',
    label: {
      name: 'addition',
      color: '0075CA',
      description: 'Created',
      aliases: [],
    },
  },
]

function result(repository: string, dryRun: boolean): SyncResult {
  return {
    repository,
    created: 1,
    updated: 2,
    deleted: 1,
    unchanged: 1,
    dryRun,
  }
}

function sync(
  repository: string,
  dryRun: boolean,
  syncChanges = changes,
): RepositorySync {
  return {
    result: result(repository, dryRun),
    changes: syncChanges,
  }
}

describe('buildPlan', () => {
  it('includes explicit operations and current and desired values', () => {
    expect(buildPlan([sync('owner/repo', true)])).toEqual({
      version: 1,
      repositories: [
        {
          repository: 'owner/repo',
          changes: [
            {
              operation: 'create',
              current: null,
              desired: {
                name: 'addition',
                color: '0075ca',
                description: 'Created',
              },
            },
            {
              operation: 'update',
              current: {
                name: 'bug',
                color: 'ffffff',
                description: 'Old description',
              },
              desired: {
                name: 'bug',
                color: 'd73a4a',
                description: 'New description',
              },
            },
            {
              operation: 'unchanged',
              current: {
                name: 'keep',
                color: '0e8a16',
                description: null,
              },
              desired: {
                name: 'keep',
                color: '0e8a16',
                description: null,
              },
            },
            {
              operation: 'rename',
              current: {
                name: 'legacy',
                color: 'ffffff',
                description: 'Before rename',
              },
              desired: {
                name: 'renamed',
                color: '000000',
                description: 'After rename',
              },
            },
            {
              operation: 'delete',
              current: {
                name: 'zebra',
                color: 'abcdef',
                description: 'Removed',
              },
              desired: null,
            },
          ],
        },
      ],
    })
  })

  it('sorts repositories and changes deterministically', () => {
    const forward = createPlanOutput([
      sync('z-owner/repo', true, changes),
      sync('A-owner/repo', true, changes),
    ]).json
    const reversed = createPlanOutput([
      sync('A-owner/repo', true, [...changes].reverse()),
      sync('z-owner/repo', true, [...changes].reverse()),
    ]).json

    expect(reversed).toBe(forward)
  })

  it('uses original casing as a deterministic sorting tie-breaker', () => {
    const plan = buildPlan([
      sync('owner/repo', true),
      sync('owner/repo', true),
      sync('OWNER/repo', true),
    ])

    expect(plan.repositories.map(({ repository }) => repository)).toEqual([
      'OWNER/repo',
      'owner/repo',
      'owner/repo',
    ])
  })

  it('emits the same plan in sync and read-only modes', () => {
    expect(createPlanOutput([sync('owner/repo', false)]).json).toBe(
      createPlanOutput([sync('owner/repo', true)]).json,
    )
  })
})

describe('createPlanOutput', () => {
  it('estimates UTF-16 size and identifies oversized outputs', () => {
    const output = createPlanOutput([sync('owner/repo', true)], 1)

    expect(output.estimatedBytes).toBe(output.json.length * 2)
    expect(output.maxBytes).toBe(1)
    expect(output.exceedsLimit).toBe(true)
  })
})
