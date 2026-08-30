import * as core from '@actions/core'

export type ActionMode = 'sync' | 'preview' | 'check'

export interface ActionInputs {
  token: string
  labelsFile: string
  repositories: string[]
  prune: boolean
  mode: ActionMode
}

export function parseMode(value: string, legacyDryRun: boolean): ActionMode {
  const mode = value.trim().toLowerCase() || 'sync'
  if (mode !== 'sync' && mode !== 'preview' && mode !== 'check') {
    throw new Error('Invalid mode: expected sync, preview, or check')
  }
  return legacyDryRun && mode === 'sync' ? 'preview' : mode
}

export function parseRepositories(
  value: string,
  defaultRepository: string,
): string[] {
  const candidates = (value.trim() || defaultRepository)
    .split(/[\n,]+/)
    .map((repository) => repository.trim())
    .filter(Boolean)

  if (candidates.length === 0) {
    throw new Error('No target repository was provided')
  }

  const repositories = new Map<string, string>()
  for (const repository of candidates) {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
      throw new Error(
        `Invalid repository: ${repository}; expected owner/repository`,
      )
    }
    repositories.set(repository.toLocaleLowerCase('en-US'), repository)
  }
  return [...repositories.values()]
}

export function getInputs(defaultRepository: string): ActionInputs {
  const legacyDryRun = core.getBooleanInput('dry-run')
  return {
    token: core.getInput('github-token', { required: true }),
    labelsFile: core.getInput('labels-file', { required: true }),
    repositories: parseRepositories(
      core.getInput('repositories'),
      defaultRepository,
    ),
    prune: core.getBooleanInput('prune'),
    mode: parseMode(core.getInput('mode'), legacyDryRun),
  }
}
