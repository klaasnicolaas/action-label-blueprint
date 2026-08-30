import * as core from '@actions/core'
import * as github from '@actions/github'
import { loadLabelConfig } from './config.js'
import { createLabelApi } from './github.js'
import { getInputs } from './inputs.js'
import { syncRepository } from './sync.js'
import type { LabelChange, SyncResult } from './types.js'

function describeChange(change: LabelChange): string {
  if (change.kind === 'update' && change.previousName !== change.name) {
    return `update ${change.previousName} → ${change.name}`
  }
  return `${change.kind} ${change.name}`
}

function total(results: SyncResult[], key: keyof SyncResult): number {
  return results.reduce((sum, result) => {
    const value = result[key]
    return sum + (typeof value === 'number' ? value : 0)
  }, 0)
}

export async function run(): Promise<void> {
  try {
    const defaultRepository = process.env.GITHUB_REPOSITORY ?? ''
    const inputs = getInputs(defaultRepository)
    const labels = await loadLabelConfig(inputs.labelsFile)
    const api = createLabelApi(github.getOctokit(inputs.token))
    const results: SyncResult[] = []
    const failures: string[] = []

    core.info(
      `Loaded ${labels.length} labels for ${inputs.repositories.length} repository target(s)`,
    )
    if (inputs.dryRun) {
      core.notice('Dry-run enabled: no labels will be modified')
    }

    for (const repository of inputs.repositories) {
      await core.group(`Synchronizing ${repository}`, async () => {
        try {
          const sync = await syncRepository(api, repository, labels, inputs)
          results.push(sync.result)
          for (const change of sync.changes) {
            core.info(describeChange(change))
          }
        } catch (error) {
          const message = `${repository}: ${(error as Error).message}`
          failures.push(message)
          core.error(message)
        }
      })
    }

    const created = total(results, 'created')
    const updated = total(results, 'updated')
    const deleted = total(results, 'deleted')
    const unchanged = total(results, 'unchanged')
    core.setOutput('repositories', results.length)
    core.setOutput('created', created)
    core.setOutput('updated', updated)
    core.setOutput('deleted', deleted)
    core.setOutput('unchanged', unchanged)
    core.setOutput('summary', JSON.stringify(results))

    await core.summary
      .addHeading(inputs.dryRun ? 'Label Blueprint dry-run' : 'Label Blueprint')
      .addTable([
        [
          { data: 'Repository', header: true },
          { data: 'Created', header: true },
          { data: 'Updated', header: true },
          { data: 'Deleted', header: true },
          { data: 'Unchanged', header: true },
        ],
        ...results.map((result) => [
          result.repository,
          String(result.created),
          String(result.updated),
          String(result.deleted),
          String(result.unchanged),
        ]),
      ])
      .write()

    if (failures.length > 0) {
      throw new Error(
        `Failed to synchronize ${failures.length} repository/repositories:\n${failures.join('\n')}`,
      )
    }
  } catch (error) {
    core.setFailed((error as Error).message)
  }
}
