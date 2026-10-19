import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createPruneIgnoreMatcher,
  planLabelChanges,
  syncRepository,
} from '../sync.js'
import type { LabelApi, LabelDefinition, RepositoryLabel } from '../types.js'

const desired: LabelDefinition[] = [
  {
    name: 'bug',
    color: 'd73a4a',
    description: 'Something is broken',
    aliases: ['defect'],
  },
  {
    name: 'documentation',
    color: '0075ca',
    description: null,
    aliases: [],
  },
]

function createApi(current: RepositoryLabel[]): LabelApi {
  return {
    list: vi.fn().mockResolvedValue(current),
    create: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    archive: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  }
}

describe('planLabelChanges', () => {
  it('plans creates, updates through aliases, and safe non-pruning', () => {
    expect(
      planLabelChanges(
        [
          {
            name: 'defect',
            color: 'ffffff',
            description: null,
            archived: false,
          },
          {
            name: 'keep-me',
            color: '000000',
            description: null,
            archived: false,
          },
        ],
        desired,
        false,
      ).changes,
    ).toEqual([
      {
        kind: 'update',
        name: 'bug',
        previousName: 'defect',
        current: {
          name: 'defect',
          color: 'ffffff',
          description: null,
          archived: false,
        },
        label: desired[0],
      },
      { kind: 'create', name: 'documentation', label: desired[1] },
    ])
  })

  it('plans deletes only when prune is enabled', () => {
    const { changes } = planLabelChanges(
      [
        {
          name: 'bug',
          color: 'd73a4a',
          description: 'Something is broken',
          archived: false,
        },
        { name: 'old', color: 'ffffff', description: null, archived: false },
      ],
      desired,
      true,
    )
    expect(changes.map(({ kind, name }) => ({ kind, name }))).toEqual([
      { kind: 'unchanged', name: 'bug' },
      { kind: 'create', name: 'documentation' },
      { kind: 'delete', name: 'old' },
    ])
  })

  it('rejects ambiguous aliases before making changes', () => {
    expect(() =>
      planLabelChanges(
        [
          {
            name: 'defect',
            color: 'ffffff',
            description: null,
            archived: false,
          },
          {
            name: 'broken',
            color: 'ffffff',
            description: null,
            archived: false,
          },
        ],
        [{ ...desired[0]!, aliases: ['defect', 'broken'] }],
        false,
      ),
    ).toThrow('Multiple aliases exist')
  })

  it('protects exact names and glob matches from pruning', () => {
    const { changes, ignored } = planLabelChanges(
      [
        {
          name: 'Dependencies',
          color: 'ffffff',
          description: null,
          archived: false,
        },
        {
          name: 'Release:Stable',
          color: 'ffffff',
          description: null,
          archived: false,
        },
        { name: 'bot-1', color: 'ffffff', description: null, archived: false },
        {
          name: 'obsolete',
          color: 'ffffff',
          description: null,
          archived: false,
        },
      ],
      [],
      true,
      ['dependencies', 'release:*', 'bot-?'],
    )

    expect(ignored.map((label) => label.name)).toEqual([
      'Dependencies',
      'Release:Stable',
      'bot-1',
    ])
    expect(changes.map((change) => change.name)).toEqual(['obsolete'])
  })

  it('archives unmanaged labels and skips labels that are already archived', () => {
    const { changes } = planLabelChanges(
      [
        {
          name: 'obsolete',
          color: 'ffffff',
          description: null,
          archived: false,
        },
        {
          name: 'historical',
          color: '000000',
          description: null,
          archived: true,
        },
      ],
      [],
      true,
      [],
      'archive',
    )

    expect(changes.map(({ kind, name }) => ({ kind, name }))).toEqual([
      { kind: 'archive', name: 'obsolete' },
    ])
  })

  it.each(['delete', 'archive'] as const)(
    'leaves unmanaged labels untouched when pruning is disabled with %s',
    (strategy) => {
      const { changes, ignored } = planLabelChanges(
        [
          {
            name: 'obsolete',
            color: 'ffffff',
            description: null,
            archived: false,
          },
          {
            name: 'historical',
            color: '000000',
            description: null,
            archived: true,
          },
        ],
        [],
        false,
        ['*'],
        strategy,
      )

      expect(changes).toEqual([])
      expect(ignored).toEqual([])
    },
  )

  it.each(['delete', 'archive'] as const)(
    'protects active and archived labels from %s pruning',
    (strategy) => {
      const protectedLabels: RepositoryLabel[] = [
        {
          name: 'Dependencies',
          color: 'ffffff',
          description: null,
          archived: false,
        },
        {
          name: 'Release:Stable',
          color: 'ffffff',
          description: null,
          archived: true,
        },
        { name: 'bot-1', color: 'ffffff', description: null, archived: false },
      ]
      const { changes, ignored } = planLabelChanges(
        [
          ...protectedLabels,
          {
            name: 'obsolete',
            color: 'ffffff',
            description: null,
            archived: false,
          },
        ],
        [],
        true,
        ['dependencies', 'release:*', 'bot-?'],
        strategy,
      )

      expect(ignored).toEqual(protectedLabels)
      expect(changes.map(({ kind, name }) => ({ kind, name }))).toEqual([
        { kind: strategy, name: 'obsolete' },
      ])
    },
  )

  it.each(['delete', 'archive'] as const)(
    'unarchives desired labels independently of %s pruning and prune-ignore',
    (strategy) => {
      const label = desired[0]!
      const current: RepositoryLabel = {
        name: label.name,
        color: label.color,
        description: label.description,
        archived: true,
      }
      const { changes } = planLabelChanges(
        [current],
        [label],
        false,
        ['*'],
        strategy,
      )

      expect(changes).toEqual([
        { kind: 'unarchive', name: 'bug', previousName: 'bug', current, label },
      ])
    },
  )

  it('combines restoring an archived alias with its rename and metadata changes', () => {
    const current: RepositoryLabel = {
      name: 'Defect',
      color: 'ffffff',
      description: null,
      archived: true,
    }
    const { changes } = planLabelChanges(
      [current],
      [desired[0]!],
      true,
      [],
      'archive',
    )

    expect(changes).toEqual([
      {
        kind: 'unarchive',
        name: 'bug',
        previousName: 'Defect',
        current,
        label: desired[0],
      },
    ])
  })

  it('still rejects conflicts between active labels and archived aliases', () => {
    expect(() =>
      planLabelChanges(
        [
          { name: 'bug', color: 'ffffff', description: null, archived: false },
          {
            name: 'defect',
            color: 'ffffff',
            description: null,
            archived: true,
          },
        ],
        [desired[0]!],
        true,
        [],
        'archive',
      ),
    ).toThrow('exists together with alias(es)')
  })

  it.each([undefined, 'delete'] as const)(
    'deletes active and archived unmanaged labels with strategy %s',
    (strategy) => {
      const { changes } = planLabelChanges(
        [
          {
            name: 'obsolete',
            color: 'ffffff',
            description: null,
            archived: false,
          },
          {
            name: 'historical',
            color: '000000',
            description: null,
            archived: true,
          },
        ],
        [],
        true,
        [],
        strategy,
      )

      expect(changes.map(({ kind, name }) => ({ kind, name }))).toEqual([
        { kind: 'delete', name: 'obsolete' },
        { kind: 'delete', name: 'historical' },
      ])
    },
  )
})

describe('createPruneIgnoreMatcher', () => {
  it('matches exact names, * and ? case-insensitively', () => {
    const matches = createPruneIgnoreMatcher([
      'github-actions',
      'release:*',
      'BOT-?',
    ])

    expect(matches('GitHub-Actions')).toBe(true)
    expect(matches('Release:Stable')).toBe(true)
    expect(matches('bot-1')).toBe(true)
    expect(matches('bot-12')).toBe(false)
  })

  it('treats other regular-expression characters literally', () => {
    const matches = createPruneIgnoreMatcher(['app[bot]'])

    expect(matches('app[bot]')).toBe(true)
    expect(matches('appb')).toBe(false)
  })
})

describe('syncRepository', () => {
  let api: LabelApi

  beforeEach(() => {
    api = createApi([
      { name: 'defect', color: 'ffffff', description: null, archived: false },
      { name: 'old', color: '000000', description: null, archived: false },
    ])
  })

  it('applies non-destructive changes before deletes', async () => {
    const { result } = await syncRepository(api, 'owner/repo', desired, {
      prune: true,
      dryRun: false,
    })

    expect(api.update).toHaveBeenCalledWith(
      'owner',
      'repo',
      'defect',
      desired[0],
    )
    expect(api.create).toHaveBeenCalledWith('owner', 'repo', desired[1])
    expect(api.remove).toHaveBeenCalledWith('owner', 'repo', 'old')
    expect(result).toEqual({
      repository: 'owner/repo',
      created: 1,
      updated: 1,
      deleted: 1,
      archived: 0,
      unarchived: 0,
      unchanged: 0,
      dryRun: false,
    })
  })

  it('does not mutate repositories during a dry-run', async () => {
    const { result } = await syncRepository(api, 'owner/repo', desired, {
      prune: true,
      dryRun: true,
    })

    expect(api.create).not.toHaveBeenCalled()
    expect(api.update).not.toHaveBeenCalled()
    expect(api.remove).not.toHaveBeenCalled()
    expect(api.archive).not.toHaveBeenCalled()
    expect(result.dryRun).toBe(true)
  })

  it('restores managed labels before archiving unmanaged labels', async () => {
    api = createApi([
      { name: 'defect', color: 'ffffff', description: null, archived: true },
      { name: 'old', color: '000000', description: null, archived: false },
      {
        name: 'historical',
        color: '000000',
        description: null,
        archived: true,
      },
      {
        name: 'Dependencies',
        color: 'ffffff',
        description: null,
        archived: false,
      },
    ])
    const { result, ignored } = await syncRepository(
      api,
      'owner/repo',
      desired,
      {
        prune: true,
        pruneStrategy: 'archive',
        pruneIgnore: ['dependencies'],
        dryRun: false,
      },
    )

    expect(api.update).toHaveBeenCalledExactlyOnceWith(
      'owner',
      'repo',
      'defect',
      desired[0],
    )
    expect(api.create).toHaveBeenCalledExactlyOnceWith(
      'owner',
      'repo',
      desired[1],
    )
    expect(api.archive).toHaveBeenCalledExactlyOnceWith('owner', 'repo', 'old')
    expect(api.remove).not.toHaveBeenCalled()
    expect(vi.mocked(api.update).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(api.archive).mock.invocationCallOrder[0]!,
    )
    expect(vi.mocked(api.create).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(api.archive).mock.invocationCallOrder[0]!,
    )
    expect(ignored.map((label) => label.name)).toEqual(['Dependencies'])
    expect(result).toEqual({
      repository: 'owner/repo',
      created: 1,
      updated: 0,
      deleted: 0,
      archived: 1,
      unarchived: 1,
      unchanged: 0,
      dryRun: false,
    })
  })

  it('reports archive and unarchive drift without mutating in a dry-run', async () => {
    api = createApi([
      { name: 'defect', color: 'ffffff', description: null, archived: true },
      { name: 'old', color: '000000', description: null, archived: false },
    ])
    const { result } = await syncRepository(api, 'owner/repo', desired, {
      prune: true,
      pruneStrategy: 'archive',
      dryRun: true,
    })

    expect(result).toMatchObject({
      created: 1,
      updated: 0,
      deleted: 0,
      archived: 1,
      unarchived: 1,
      dryRun: true,
    })
    expect(api.create).not.toHaveBeenCalled()
    expect(api.update).not.toHaveBeenCalled()
    expect(api.archive).not.toHaveBeenCalled()
    expect(api.remove).not.toHaveBeenCalled()
  })

  it('does not prune if restoring a desired label fails', async () => {
    api = createApi([
      { name: 'defect', color: 'ffffff', description: null, archived: true },
      { name: 'old', color: '000000', description: null, archived: false },
    ])
    vi.mocked(api.update).mockRejectedValueOnce(new Error('Forbidden'))

    await expect(
      syncRepository(api, 'owner/repo', desired, {
        prune: true,
        pruneStrategy: 'archive',
        dryRun: false,
      }),
    ).rejects.toThrow('Forbidden')

    expect(api.archive).not.toHaveBeenCalled()
    expect(api.remove).not.toHaveBeenCalled()
  })

  it('has no drift when only unmanaged archived labels remain', async () => {
    api = createApi([
      {
        name: 'bug',
        color: 'd73a4a',
        description: 'Something is broken',
        archived: false,
      },
      {
        name: 'documentation',
        color: '0075ca',
        description: null,
        archived: false,
      },
      { name: 'old', color: '000000', description: null, archived: true },
    ])
    const { result } = await syncRepository(api, 'owner/repo', desired, {
      prune: true,
      pruneStrategy: 'archive',
      dryRun: true,
    })

    expect(result).toMatchObject({
      created: 0,
      updated: 0,
      deleted: 0,
      archived: 0,
      unarchived: 0,
      unchanged: 2,
    })
  })
})
