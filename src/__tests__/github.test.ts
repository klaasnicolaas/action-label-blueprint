import { describe, expect, it, vi } from 'vitest'
import { createLabelApi } from '../github.js'
import type { LabelDefinition } from '../types.js'

describe('createLabelApi', () => {
  it('maps list results and forwards mutations to Octokit', async () => {
    const listLabelsForRepo = vi.fn()
    const createLabel = vi.fn().mockResolvedValue(undefined)
    const updateLabel = vi.fn().mockResolvedValue(undefined)
    const deleteLabel = vi.fn().mockResolvedValue(undefined)
    const paginate = vi
      .fn()
      .mockResolvedValue([{ name: 'bug', color: 'D73A4A', description: null }])
    const client = {
      paginate,
      rest: {
        issues: {
          listLabelsForRepo,
          createLabel,
          updateLabel,
          deleteLabel,
        },
      },
    }
    const api = createLabelApi(
      client as unknown as Parameters<typeof createLabelApi>[0],
    )
    const label: LabelDefinition = {
      name: 'bug',
      color: 'd73a4a',
      description: null,
      aliases: [],
    }

    await expect(api.list('owner', 'repo')).resolves.toEqual([
      { name: 'bug', color: 'D73A4A', description: null },
    ])
    expect(paginate).toHaveBeenCalledWith(listLabelsForRepo, {
      owner: 'owner',
      repo: 'repo',
      per_page: 100,
    })

    await api.create('owner', 'repo', label)
    await api.update('owner', 'repo', 'defect', label)
    await api.remove('owner', 'repo', 'old')

    expect(createLabel).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      name: 'bug',
      color: 'd73a4a',
      description: '',
    })
    expect(updateLabel).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      name: 'defect',
      new_name: 'bug',
      color: 'd73a4a',
      description: '',
    })
    expect(deleteLabel).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      name: 'old',
    })
  })
})
