import { beforeEach, describe, expect, it, vi } from 'vitest'
import { planLabelChanges, syncRepository } from '../sync.js'
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
    remove: vi.fn().mockResolvedValue(undefined),
  }
}

describe('planLabelChanges', () => {
  it('plans creates, updates through aliases, and safe non-pruning', () => {
    expect(
      planLabelChanges(
        [
          { name: 'defect', color: 'ffffff', description: null },
          { name: 'keep-me', color: '000000', description: null },
        ],
        desired,
        false,
      ),
    ).toEqual([
      {
        kind: 'update',
        name: 'bug',
        previousName: 'defect',
        current: { name: 'defect', color: 'ffffff', description: null },
        label: desired[0],
      },
      { kind: 'create', name: 'documentation', label: desired[1] },
    ])
  })

  it('plans deletes only when prune is enabled', () => {
    const changes = planLabelChanges(
      [
        {
          name: 'bug',
          color: 'd73a4a',
          description: 'Something is broken',
        },
        { name: 'old', color: 'ffffff', description: null },
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
          { name: 'defect', color: 'ffffff', description: null },
          { name: 'broken', color: 'ffffff', description: null },
        ],
        [{ ...desired[0]!, aliases: ['defect', 'broken'] }],
        false,
      ),
    ).toThrow('Multiple aliases exist')
  })
})

describe('syncRepository', () => {
  let api: LabelApi

  beforeEach(() => {
    api = createApi([
      { name: 'defect', color: 'ffffff', description: null },
      { name: 'old', color: '000000', description: null },
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
    expect(result.dryRun).toBe(true)
  })
})
