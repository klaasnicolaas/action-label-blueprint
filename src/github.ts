import type { getOctokit } from '@actions/github'
import type { LabelApi, LabelDefinition, RepositoryLabel } from './types.js'

type Octokit = ReturnType<typeof getOctokit>

export function createLabelApi(client: Octokit): LabelApi {
  return {
    async list(owner, repo): Promise<RepositoryLabel[]> {
      const labels = await client.paginate(
        client.rest.issues.listLabelsForRepo,
        {
          owner,
          repo,
          per_page: 100,
        },
      )
      return labels.map((label) => ({
        name: label.name,
        color: label.color,
        description: label.description,
      }))
    },

    async create(owner, repo, label: LabelDefinition): Promise<void> {
      await client.rest.issues.createLabel({
        owner,
        repo,
        name: label.name,
        color: label.color,
        description: label.description ?? '',
      })
    },

    async update(owner, repo, currentName, label): Promise<void> {
      await client.rest.issues.updateLabel({
        owner,
        repo,
        name: currentName,
        new_name: label.name,
        color: label.color,
        description: label.description ?? '',
      })
    },

    async remove(owner, repo, name): Promise<void> {
      await client.rest.issues.deleteLabel({ owner, repo, name })
    },
  }
}
