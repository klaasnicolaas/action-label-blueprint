import * as core from '@actions/core'
import * as github from '@actions/github'
import { loadLabelConfig } from './config.js'
import { createLabelApi } from './github.js'
import { getInputs } from './inputs.js'
import { createPlanOutput } from './plan.js'
import {
  escapeHtml,
  MAX_DETAILED_CHANGES,
  renderChangeTable,
} from './summary.js'
import { syncRepository } from './sync.js'
import type { LabelChange, RepositorySync, SyncResult } from './types.js'

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

function formatCount(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${count} ${count === 1 ? singular : plural}`
}

export async function run(): Promise<void> {
  try {
    const defaultRepository = process.env.GITHUB_REPOSITORY ?? ''
    const inputs = getInputs(defaultRepository)
    const labels = await loadLabelConfig(inputs.labelsFile)
    const api = createLabelApi(github.getOctokit(inputs.token))
    const dryRun = inputs.mode !== 'sync'
    const syncs: RepositorySync[] = []
    const failures: string[] = []

    core.info(
      `Loaded ${labels.length} labels for ${inputs.repositories.length} repository target(s)`,
    )
    if (inputs.mode === 'preview') {
      core.notice('Preview mode enabled: no labels will be modified')
    } else if (inputs.mode === 'check') {
      core.notice(
        'Check mode enabled: no labels will be modified and drift will fail the run',
      )
    }

    for (const repository of inputs.repositories) {
      await core.group(`Synchronizing ${repository}`, async () => {
        try {
          const sync = await syncRepository(api, repository, labels, {
            prune: inputs.prune,
            dryRun,
          })
          syncs.push(sync)
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

    const results = syncs.map((sync) => sync.result)
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
    const planOutput = createPlanOutput(syncs)
    if (planOutput.exceedsLimit) {
      core.warning(
        `Synchronization plan output is approximately ${Math.ceil(planOutput.estimatedBytes / 1024)} KiB and exceeds the safe ${Math.floor(planOutput.maxBytes / 1024)} KiB limit; the plan output was omitted`,
      )
      core.setOutput('plan', '')
    } else {
      core.setOutput('plan', planOutput.json)
    }

    const summary = core.summary
      .addHeading(
        inputs.mode === 'sync'
          ? 'Label Blueprint'
          : `Label Blueprint ${inputs.mode}`,
      )
      .addTable([
        [
          { data: 'Repository', header: true },
          { data: 'Created', header: true },
          { data: 'Updated', header: true },
          { data: 'Deleted', header: true },
          { data: 'Unchanged', header: true },
        ],
        ...results.map((result) => [
          escapeHtml(result.repository),
          String(result.created),
          String(result.updated),
          String(result.deleted),
          String(result.unchanged),
        ]),
      ])

    for (const sync of syncs) {
      const rendered = renderChangeTable(sync.changes)
      if (rendered.total === 0) {
        continue
      }

      const state = sync.result.dryRun ? 'planned' : 'applied'
      summary.addDetails(
        `${escapeHtml(sync.result.repository)} — ${formatCount(rendered.total, `${state} change`)}`,
        rendered.html,
      )
      if (rendered.truncated) {
        core.notice(
          `Detailed summary for ${sync.result.repository} shows the first ${MAX_DETAILED_CHANGES} of ${rendered.total} changes`,
        )
      }
    }

    await summary.write()

    const problems: string[] = []
    if (failures.length > 0) {
      problems.push(
        `Failed to synchronize ${formatCount(failures.length, 'repository', 'repositories')}:\n${failures.join('\n')}`,
      )
    }

    if (inputs.mode === 'check') {
      const driftedRepositories = results.filter(
        (result) => result.created + result.updated + result.deleted > 0,
      ).length
      const driftedLabels = created + updated + deleted
      if (driftedLabels > 0) {
        problems.push(
          `Label drift detected in ${formatCount(driftedRepositories, 'repository', 'repositories')} affecting ${formatCount(driftedLabels, 'label')}`,
        )
      }
    }

    if (problems.length > 0) {
      throw new Error(problems.join('\n\n'))
    }
  } catch (error) {
    core.setFailed((error as Error).message)
  }
}
