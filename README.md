## 🏷️ Label Sync

[![GitHub Release][releases-shield]][releases]
![Project Stage][project-stage-shield]
![Project Maintenance][maintenance-shield]
[![License][license-shield]](LICENSE)

[![Test Status][test-shield]][test-url]
[![Code Coverage][codecov-shield]][codecov-url]


Synchronize labels in one or more GitHub repositories from a declarative YAML
or JSON file. The action creates missing labels, updates changed labels and can
safely rename labels through aliases without removing them from issues and pull
requests.

### Features

- **Declarative Configuration**: Manage labels from a version-controlled YAML or JSON file, loaded locally or from a remote URL.
- **Multi-Repository Sync**: Apply one consistent label configuration to one or multiple repositories.
- **Assignment-Safe Renames**: Rename existing labels through aliases while preserving their issue and pull request assignments.
- **Non-Destructive by Default**: Keep unmanaged labels unless pruning is explicitly enabled.
- **Dry-Run Preview**: Review planned creates, updates, renames and deletions in the job summary before applying them.
- **Strict Validation**: Detect invalid colors, duplicate names and ambiguous aliases before repository changes start.
- **Actionable Results**: Expose synchronization counts as workflow outputs and aggregate failures across multiple repositories.

## Example workflow

This example synchronizes labels in the current repository whenever its label
configuration changes.

Create `.github/labels.yml`:

```yaml
---
- name: 'bug'
  color: d73a4a
  description: 'Something is not working.'
  aliases:
    - 'defect'

- name: 'documentation'
  color: '#0075ca'
  description: 'Documentation improvements.'
```

Then add a workflow:

```yaml
---
name: Sync labels

on:
  push:
    branches: [main]
    paths:
      - '.github/labels.yml'
  workflow_dispatch:

permissions:
  contents: read
  issues: write

jobs:
  labels:
    runs-on: ubuntu-latest
    steps:
      - name: Check out repository
        uses: actions/checkout@v7
      - name: Synchronize labels
        uses: klaasnicolaas/action-label-sync@v1
```

`pull-requests: write` is not required: GitHub manages labels for issues and
pull requests through the Issues labels API.

### Multiple repositories

The default workflow token normally only has access to its own repository. Use
a GitHub App token or fine-grained personal access token (PAT) with Issues write
permission for every cross-repository target.

```yaml
- uses: klaasnicolaas/action-label-sync@v1
  with:
    github-token: ${{ secrets.LABEL_SYNC_TOKEN }}
    repositories: |
      owner/first-repository
      owner/second-repository
    labels-file: .github/labels.yml
```

### Preview and prune

Preview the exact changes without calling create, update or delete endpoints:

```yaml
- uses: klaasnicolaas/action-label-sync@v1
  with:
    dry-run: true
    prune: true
```

After reviewing the job summary, remove `dry-run`. Enabling `prune` deletes all
repository labels that are not represented by a configured label or a matched
alias. Pruning is intentionally disabled by default.

### Remote configuration

Public configurations can be loaded without checking out a repository:

```yaml
- uses: klaasnicolaas/action-label-sync@v1
  with:
    labels-file: https://raw.githubusercontent.com/owner/config/main/labels.yml
```

Remote files have a 15-second timeout and a 5 MiB size limit. Authentication
headers are not sent to remote URLs; check out private configuration files
before running the action.

## Inputs

The following input parameters can be used to configure the action.

_If no input parameters are provided, the action will use the default values._

### `github-token`

The token used to manage labels through the GitHub API. It needs Issues write
permission for every target repository.

- Default: `${{ github.token }}`
- Usage: **Optional**

### `labels-file`

The local path or HTTP(S) URL to a YAML or JSON label configuration.

- Default: `.github/labels.yml`
- Usage: **Optional**

### `repositories`

A comma- or newline-separated list of repositories in `owner/repository`
format.

- Default: _Current repository_
- Usage: **Optional**

### `prune`

Delete labels that are absent from the configuration. This can be destructive,
so pruning is disabled by default.

- Default: `false`
- Usage: **Optional**

### `dry-run`

Report planned changes without creating, updating or deleting labels.

- Default: `false`
- Usage: **Optional**

## Outputs

The following outputs can be used in subsequent workflow steps. In dry-run
mode, the counts describe planned changes.

### `repositories`

The number of successfully synchronized repositories.

### `created`

The total number of labels created or planned for creation.

### `updated`

The total number of labels updated, renamed or planned for updating.

### `deleted`

The total number of labels deleted or planned for deletion.

### `unchanged`

The total number of labels that already matched the configuration.

### `summary`

A JSON array containing synchronization counts for each repository.

```json
[
  {
    "repository": "owner/repository",
    "created": 1,
    "updated": 2,
    "deleted": 0,
    "unchanged": 5,
    "dryRun": false
  }
]
```

## Configuration rules

The root may be an array or an object with a `labels` array. Every label needs a
unique name and six-digit hexadecimal color. Descriptions are optional and may
contain up to 100 characters. Names and aliases may contain up to 50
characters. Name and alias comparisons are case-insensitive.

Aliases are previous names for a label. When exactly one alias exists in a
repository, it is renamed through GitHub's update endpoint, preserving its
assignments. Ambiguous aliases and conflicts are rejected before changes are
applied.

## Contributing

This is an active open-source project. We are always open to people who want to
use the code or contribute to it.

We've set up a separate document for our
[contribution guidelines](CONTRIBUTING.md).

Thank you for being involved! :heart_eyes:

## License

Distributed under the **Apache License 2.0** license. See [`LICENSE`](LICENSE) for more information.

<!-- LINKS -->

[codecov-shield]: https://codecov.io/gh/klaasnicolaas/action-label-sync/branch/main/graph/badge.svg?token=
[codecov-url]: https://codecov.io/gh/klaasnicolaas/action-label-sync
[license-shield]: https://img.shields.io/github/license/klaasnicolaas/action-label-sync.svg
[maintenance-shield]: https://img.shields.io/maintenance/yes/2026.svg
[project-stage-shield]: https://img.shields.io/badge/project%20stage-production%20ready-brightgreen.svg
[releases-shield]: https://img.shields.io/github/release/klaasnicolaas/action-label-sync.svg
[releases]: https://github.com/klaasnicolaas/action-label-sync/releases
[test-shield]: https://github.com/klaasnicolaas/action-label-sync/actions/workflows/tests.yaml/badge.svg
[test-url]: https://github.com/klaasnicolaas/action-label-sync/actions/workflows/tests.yaml
