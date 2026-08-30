export interface LabelDefinition {
  name: string
  color: string
  description: string | null
  aliases: string[]
}

export interface RepositoryLabel {
  name: string
  color: string
  description: string | null
}

export type ChangeKind = 'create' | 'update' | 'delete' | 'unchanged'

export interface LabelChange {
  kind: ChangeKind
  name: string
  previousName?: string
  label?: LabelDefinition
}

export interface SyncResult {
  repository: string
  created: number
  updated: number
  deleted: number
  unchanged: number
  dryRun: boolean
}

export interface LabelApi {
  list(owner: string, repo: string): Promise<RepositoryLabel[]>
  create(owner: string, repo: string, label: LabelDefinition): Promise<void>
  update(
    owner: string,
    repo: string,
    currentName: string,
    label: LabelDefinition,
  ): Promise<void>
  remove(owner: string, repo: string, name: string): Promise<void>
}
