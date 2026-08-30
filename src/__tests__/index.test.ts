import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const summary = {
    addHeading: vi.fn(),
    addTable: vi.fn(),
    addDetails: vi.fn(),
    write: vi.fn(),
  }
  summary.addHeading.mockReturnValue(summary)
  summary.addTable.mockReturnValue(summary)
  summary.addDetails.mockReturnValue(summary)
  summary.write.mockResolvedValue(summary)
  return {
    summary,
    info: vi.fn(),
    notice: vi.fn(),
    error: vi.fn(),
    setOutput: vi.fn(),
    setFailed: vi.fn(),
    group: vi.fn(async (_name: string, callback: () => Promise<void>) =>
      callback(),
    ),
    getOctokit: vi.fn(),
    loadLabelConfig: vi.fn(),
    getInputs: vi.fn(),
    createLabelApi: vi.fn(),
    syncRepository: vi.fn(),
  }
})

vi.mock('@actions/core', () => ({
  summary: mocks.summary,
  info: mocks.info,
  notice: mocks.notice,
  error: mocks.error,
  setOutput: mocks.setOutput,
  setFailed: mocks.setFailed,
  group: mocks.group,
}))
vi.mock('@actions/github', () => ({ getOctokit: mocks.getOctokit }))
vi.mock('../config.js', () => ({ loadLabelConfig: mocks.loadLabelConfig }))
vi.mock('../inputs.js', () => ({ getInputs: mocks.getInputs }))
vi.mock('../github.js', () => ({ createLabelApi: mocks.createLabelApi }))
vi.mock('../sync.js', () => ({ syncRepository: mocks.syncRepository }))

import { run } from '../index.js'

describe('run', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.summary.addHeading.mockReturnValue(mocks.summary)
    mocks.summary.addTable.mockReturnValue(mocks.summary)
    mocks.summary.addDetails.mockReturnValue(mocks.summary)
    mocks.summary.write.mockResolvedValue(mocks.summary)
    mocks.getInputs.mockReturnValue({
      token: 'token',
      labelsFile: 'labels.yml',
      repositories: ['owner/one', 'owner/two'],
      prune: false,
      mode: 'preview',
    })
    mocks.loadLabelConfig.mockResolvedValue([
      {
        name: 'bug',
        color: 'd73a4a',
        description: null,
        aliases: [],
      },
    ])
    mocks.getOctokit.mockReturnValue({})
    mocks.createLabelApi.mockReturnValue({})
  })

  it('reports aggregated results and change details', async () => {
    mocks.syncRepository
      .mockResolvedValueOnce({
        result: {
          repository: 'owner/one',
          created: 1,
          updated: 1,
          deleted: 0,
          unchanged: 0,
          dryRun: true,
        },
        changes: [
          {
            kind: 'create',
            name: 'bug',
            label: {
              name: 'bug',
              color: 'd73a4a',
              description: null,
              aliases: [],
            },
          },
          {
            kind: 'update',
            name: 'docs',
            previousName: 'documentation',
            current: {
              name: 'documentation',
              color: 'ffffff',
              description: 'Old docs',
            },
            label: {
              name: 'docs',
              color: '0075ca',
              description: 'New docs',
              aliases: ['documentation'],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        result: {
          repository: 'owner/two',
          created: 0,
          updated: 0,
          deleted: 0,
          unchanged: 1,
          dryRun: true,
        },
        changes: [
          {
            kind: 'unchanged',
            name: 'bug',
            current: { name: 'bug', color: 'd73a4a', description: null },
          },
        ],
      })

    await run()

    expect(mocks.notice).toHaveBeenCalledWith(
      'Preview mode enabled: no labels will be modified',
    )
    expect(mocks.info).toHaveBeenCalledWith('update documentation → docs')
    expect(mocks.setOutput).toHaveBeenCalledWith('repositories', 2)
    expect(mocks.setOutput).toHaveBeenCalledWith('created', 1)
    expect(mocks.setOutput).toHaveBeenCalledWith('updated', 1)
    expect(mocks.setOutput).toHaveBeenCalledWith('deleted', 0)
    expect(mocks.setOutput).toHaveBeenCalledWith('unchanged', 1)
    expect(mocks.summary.addDetails).toHaveBeenCalledTimes(1)
    expect(mocks.summary.addDetails).toHaveBeenCalledWith(
      'owner/one — 2 planned changes',
      expect.stringContaining('<td>Rename</td>'),
    )
    expect(mocks.setFailed).not.toHaveBeenCalled()
  })

  it('applies changes and uses the default heading in sync mode', async () => {
    mocks.getInputs.mockReturnValue({
      token: 'token',
      labelsFile: 'labels.yml',
      repositories: ['owner/one'],
      prune: false,
      mode: 'sync',
    })
    mocks.syncRepository.mockResolvedValue({
      result: {
        repository: 'owner/one',
        created: 1,
        updated: 0,
        deleted: 0,
        unchanged: 0,
        dryRun: false,
      },
      changes: [
        {
          kind: 'create',
          name: 'bug',
          label: {
            name: 'bug',
            color: 'd73a4a',
            description: null,
            aliases: [],
          },
        },
      ],
    })

    await run()

    expect(mocks.syncRepository).toHaveBeenCalledWith(
      expect.anything(),
      'owner/one',
      expect.any(Array),
      { prune: false, dryRun: false },
    )
    expect(mocks.summary.addHeading).toHaveBeenCalledWith('Label Blueprint')
    expect(mocks.summary.addDetails).toHaveBeenCalledWith(
      'owner/one — 1 applied change',
      expect.stringContaining('<td>Create</td>'),
    )
    expect(mocks.notice).not.toHaveBeenCalled()
    expect(mocks.setFailed).not.toHaveBeenCalled()
  })

  it('continues after a repository failure and fails at the end', async () => {
    mocks.syncRepository
      .mockRejectedValueOnce(new Error('Forbidden'))
      .mockResolvedValueOnce({
        result: {
          repository: 'owner/two',
          created: 0,
          updated: 0,
          deleted: 0,
          unchanged: 1,
          dryRun: true,
        },
        changes: [
          {
            kind: 'create',
            name: 'bug',
            label: {
              name: 'bug',
              color: 'd73a4a',
              description: null,
              aliases: [],
            },
          },
          {
            kind: 'update',
            name: 'docs',
            previousName: 'docs',
            current: {
              name: 'docs',
              color: 'ffffff',
              description: null,
            },
            label: {
              name: 'docs',
              color: '0075ca',
              description: null,
              aliases: [],
            },
          },
        ],
      })

    await run()

    expect(mocks.syncRepository).toHaveBeenCalledTimes(2)
    expect(mocks.error).toHaveBeenCalledWith('owner/one: Forbidden')
    expect(mocks.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('Failed to synchronize 1 repository'),
    )
  })

  it('fails after reporting outputs and the summary when drift is detected', async () => {
    mocks.getInputs.mockReturnValue({
      token: 'token',
      labelsFile: 'labels.yml',
      repositories: ['owner/one', 'owner/two'],
      prune: false,
      mode: 'check',
    })
    mocks.syncRepository
      .mockResolvedValueOnce({
        result: {
          repository: 'owner/one',
          created: 1,
          updated: 1,
          deleted: 0,
          unchanged: 0,
          dryRun: true,
        },
        changes: [
          {
            kind: 'delete',
            name: 'stale',
            current: {
              name: 'stale',
              color: '000000',
              description: null,
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        result: {
          repository: 'owner/two',
          created: 0,
          updated: 0,
          deleted: 1,
          unchanged: 1,
          dryRun: true,
        },
        changes: [],
      })

    await run()

    expect(mocks.notice).toHaveBeenCalledWith(
      'Check mode enabled: no labels will be modified and drift will fail the run',
    )
    expect(mocks.syncRepository).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      expect.any(Array),
      { prune: false, dryRun: true },
    )
    expect(mocks.setOutput).toHaveBeenCalledWith('created', 1)
    expect(mocks.setOutput).toHaveBeenCalledWith('updated', 1)
    expect(mocks.setOutput).toHaveBeenCalledWith('deleted', 1)
    expect(mocks.summary.write).toHaveBeenCalled()
    expect(mocks.setFailed).toHaveBeenCalledWith(
      'Label drift detected in 2 repositories affecting 3 labels',
    )
    expect(mocks.summary.write.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.setFailed.mock.invocationCallOrder[0]!,
    )
  })

  it('succeeds in check mode when all repositories are synchronized', async () => {
    mocks.getInputs.mockReturnValue({
      token: 'token',
      labelsFile: 'labels.yml',
      repositories: ['owner/one', 'owner/two'],
      prune: false,
      mode: 'check',
    })
    mocks.syncRepository.mockImplementation(
      async (_api, repository: string) => ({
        result: {
          repository,
          created: 0,
          updated: 0,
          deleted: 0,
          unchanged: 1,
          dryRun: true,
        },
        changes: [
          {
            kind: 'unchanged',
            name: 'bug',
            current: { name: 'bug', color: 'd73a4a', description: null },
          },
        ],
      }),
    )

    await run()

    expect(mocks.summary.addDetails).not.toHaveBeenCalled()
    expect(mocks.setFailed).not.toHaveBeenCalled()
  })

  it('truncates large repository details with a visible notice', async () => {
    const changes = Array.from({ length: 101 }, (_, index) => ({
      kind: 'create' as const,
      name: `label-${index}`,
      label: {
        name: `label-${index}`,
        color: 'ffffff',
        description: null,
        aliases: [],
      },
    }))
    mocks.syncRepository
      .mockResolvedValueOnce({
        result: {
          repository: 'owner/one',
          created: 101,
          updated: 0,
          deleted: 0,
          unchanged: 0,
          dryRun: true,
        },
        changes,
      })
      .mockResolvedValueOnce({
        result: {
          repository: 'owner/two',
          created: 0,
          updated: 0,
          deleted: 0,
          unchanged: 1,
          dryRun: true,
        },
        changes: [],
      })

    await run()

    expect(mocks.summary.addDetails).toHaveBeenCalledWith(
      'owner/one — 101 planned changes',
      expect.stringContaining('Showing the first 100 of 101 changes.'),
    )
    expect(mocks.notice).toHaveBeenCalledWith(
      'Detailed summary for owner/one shows the first 100 of 101 changes',
    )
  })

  it('reports repository failures together with detected drift', async () => {
    mocks.getInputs.mockReturnValue({
      token: 'token',
      labelsFile: 'labels.yml',
      repositories: ['owner/one', 'owner/two'],
      prune: false,
      mode: 'check',
    })
    mocks.syncRepository
      .mockRejectedValueOnce(new Error('Forbidden'))
      .mockResolvedValueOnce({
        result: {
          repository: 'owner/two',
          created: 1,
          updated: 0,
          deleted: 0,
          unchanged: 0,
          dryRun: true,
        },
        changes: [
          {
            kind: 'create',
            name: 'bug',
            label: {
              name: 'bug',
              color: 'd73a4a',
              description: null,
              aliases: [],
            },
          },
        ],
      })

    await run()

    expect(mocks.setFailed).toHaveBeenCalledWith(
      expect.stringMatching(
        /Failed to synchronize 1 repository:[\s\S]*Label drift detected in 1 repository affecting 1 label/,
      ),
    )
  })

  it('fails cleanly when setup fails', async () => {
    mocks.loadLabelConfig.mockRejectedValue(new Error('Invalid configuration'))

    await run()

    expect(mocks.setFailed).toHaveBeenCalledWith('Invalid configuration')
  })
})
