import type {
  LabelApi,
  LabelChange,
  LabelDefinition,
  RepositoryLabel,
  RepositorySync,
} from './types.js'

const keyOf = (value: string): string => value.toLocaleLowerCase('en-US')

function hasMetadataChanged(
  current: RepositoryLabel,
  desired: LabelDefinition,
): boolean {
  return (
    current.name !== desired.name ||
    current.color.toLowerCase() !== desired.color ||
    (current.description ?? '') !== (desired.description ?? '')
  )
}

export function planLabelChanges(
  current: RepositoryLabel[],
  desired: LabelDefinition[],
  prune: boolean,
): LabelChange[] {
  const currentByName = new Map(
    current.map((label) => [keyOf(label.name), label]),
  )
  const claimed = new Set<string>()
  const changes: LabelChange[] = []

  for (const label of desired) {
    const exact = currentByName.get(keyOf(label.name))
    const aliasMatches = label.aliases
      .map((alias) => currentByName.get(keyOf(alias)))
      .filter(
        (candidate): candidate is RepositoryLabel => candidate !== undefined,
      )

    if (exact && aliasMatches.length > 0) {
      throw new Error(
        `Label ${label.name} exists together with alias(es): ${aliasMatches.map((item) => item.name).join(', ')}`,
      )
    }
    if (aliasMatches.length > 1) {
      throw new Error(
        `Multiple aliases exist for ${label.name}: ${aliasMatches.map((item) => item.name).join(', ')}`,
      )
    }

    const matched = exact ?? aliasMatches[0]
    if (!matched) {
      changes.push({ kind: 'create', name: label.name, label })
      continue
    }

    claimed.add(keyOf(matched.name))
    if (hasMetadataChanged(matched, label)) {
      changes.push({
        kind: 'update',
        name: label.name,
        previousName: matched.name,
        current: matched,
        label,
      })
    } else {
      changes.push({ kind: 'unchanged', name: label.name, current: matched })
    }
  }

  if (prune) {
    for (const label of current) {
      if (!claimed.has(keyOf(label.name))) {
        changes.push({ kind: 'delete', name: label.name, current: label })
      }
    }
  }

  return changes
}

export async function syncRepository(
  api: LabelApi,
  repository: string,
  desired: LabelDefinition[],
  options: { prune: boolean; dryRun: boolean },
): Promise<RepositorySync> {
  const [owner, repo] = repository.split('/')
  if (!owner || !repo) {
    throw new Error(`Invalid repository: ${repository}`)
  }

  const current = await api.list(owner, repo)
  const changes = planLabelChanges(current, desired, options.prune)

  if (!options.dryRun) {
    for (const change of changes) {
      if (change.kind === 'create') {
        await api.create(owner, repo, change.label)
      } else if (change.kind === 'update') {
        await api.update(owner, repo, change.previousName, change.label)
      }
    }
    for (const change of changes) {
      if (change.kind === 'delete') {
        await api.remove(owner, repo, change.name)
      }
    }
  }

  const count = (kind: LabelChange['kind']): number =>
    changes.filter((change) => change.kind === kind).length

  return {
    changes,
    result: {
      repository,
      created: count('create'),
      updated: count('update'),
      deleted: count('delete'),
      unchanged: count('unchanged'),
      dryRun: options.dryRun,
    },
  }
}
