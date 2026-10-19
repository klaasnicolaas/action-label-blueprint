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
  archived: boolean
}

export type PruneStrategy = 'delete' | 'archive'

export type ChangeKind =
  'create' | 'update' | 'delete' | 'archive' | 'unarchive' | 'unchanged'

export type LabelChange =
  | {
      kind: 'create'
      name: string
      label: LabelDefinition
    }
  | {
      kind: 'update'
      name: string
      previousName: string
      current: RepositoryLabel
      label: LabelDefinition
    }
  | {
      kind: 'unarchive'
      name: string
      previousName: string
      current: RepositoryLabel
      label: LabelDefinition
    }
  | {
      kind: 'delete'
      name: string
      current: RepositoryLabel
    }
  | {
      kind: 'archive'
      name: string
      current: RepositoryLabel
    }
  | {
      kind: 'unchanged'
      name: string
      current: RepositoryLabel
    }

export interface SyncResult {
  repository: string
  created: number
  updated: number
  deleted: number
  archived: number
  unarchived: number
  unchanged: number
  dryRun: boolean
}

export interface RepositorySync {
  result: SyncResult
  changes: LabelChange[]
  ignored: RepositoryLabel[]
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
  archive(owner: string, repo: string, name: string): Promise<void>
  remove(owner: string, repo: string, name: string): Promise<void>
}
