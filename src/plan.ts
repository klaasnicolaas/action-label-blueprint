import type {
  LabelChange,
  LabelDefinition,
  RepositoryLabel,
  RepositorySync,
} from './types.js'

export const PLAN_SCHEMA_VERSION = 1
export const MAX_PLAN_OUTPUT_BYTES = 900 * 1024

export type PlanOperation =
  | 'create'
  | 'update'
  | 'rename'
  | 'delete'
  | 'unchanged'

export interface PlanLabel {
  name: string
  color: string
  description: string | null
}

export interface PlanChange {
  operation: PlanOperation
  current: PlanLabel | null
  desired: PlanLabel | null
}

export interface RepositoryPlan {
  repository: string
  changes: PlanChange[]
}

export interface SynchronizationPlan {
  version: typeof PLAN_SCHEMA_VERSION
  repositories: RepositoryPlan[]
}

export interface PlanOutput {
  json: string
  estimatedBytes: number
  maxBytes: number
  exceedsLimit: boolean
}

function planLabel(label: RepositoryLabel | LabelDefinition): PlanLabel {
  return {
    name: label.name,
    color: label.color.toLowerCase(),
    description: label.description,
  }
}

function operation(change: LabelChange): PlanOperation {
  if (
    change.kind === 'update' &&
    change.current.name !== change.label.name
  ) {
    return 'rename'
  }
  return change.kind
}

function planChange(change: LabelChange): PlanChange {
  return {
    operation: operation(change),
    current: change.kind === 'create' ? null : planLabel(change.current),
    desired: change.kind === 'delete' ? null : planLabel(change.label),
  }
}

function compareText(left: string, right: string): number {
  const normalizedLeft = left.toLowerCase()
  const normalizedRight = right.toLowerCase()
  if (normalizedLeft !== normalizedRight) {
    return normalizedLeft < normalizedRight ? -1 : 1
  }
  if (left === right) {
    return 0
  }
  return left < right ? -1 : 1
}

function changeName(change: PlanChange): string {
  return change.desired?.name ?? change.current?.name ?? ''
}

function compareChanges(left: PlanChange, right: PlanChange): number {
  return compareText(changeName(left), changeName(right))
}

export function buildPlan(syncs: RepositorySync[]): SynchronizationPlan {
  return {
    version: PLAN_SCHEMA_VERSION,
    repositories: syncs
      .map((sync) => ({
        repository: sync.result.repository,
        changes: sync.changes.map(planChange).sort(compareChanges),
      }))
      .sort((left, right) => compareText(left.repository, right.repository)),
  }
}

export function createPlanOutput(
  syncs: RepositorySync[],
  maxBytes = MAX_PLAN_OUTPUT_BYTES,
): PlanOutput {
  const json = JSON.stringify(buildPlan(syncs))
  const estimatedBytes = json.length * 2
  return {
    json,
    estimatedBytes,
    maxBytes,
    exceedsLimit: estimatedBytes > maxBytes,
  }
}
