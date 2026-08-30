<p align="center">
  <picture>
    <img alt="Label Blueprint" src=".github/assets/icon.svg" width="96">
  </picture>
</p>

<p align="center">
  <strong>Manage GitHub repository labels from a declarative YAML or JSON configuration.</strong>
</p>

<p align="center">
  <a href="https://github.com/klaasnicolaas/action-label-blueprint/actions/workflows/tests.yaml"><img src="https://github.com/klaasnicolaas/action-label-blueprint/actions/workflows/tests.yaml/badge.svg" alt="Tests"></a>
  <a href="https://codecov.io/gh/klaasnicolaas/action-label-blueprint"><img src="https://codecov.io/gh/klaasnicolaas/action-label-blueprint/branch/main/graph/badge.svg" alt="Coverage"></a>
  <a href="https://github.com/klaasnicolaas/action-label-blueprint/releases"><img src="https://img.shields.io/github/v/release/klaasnicolaas/action-label-blueprint" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/klaasnicolaas/action-label-blueprint" alt="License"></a>
</p>

<p align="center">
  <a href="https://github.com/klaasnicolaas/action-label-blueprint/releases/latest"><strong>Latest release</strong></a>
  &middot;
  <a href="#quick-start"><strong>Usage</strong></a>
  &middot;
  <a href="#configuration-rules"><strong>Configuration</strong></a>
  &middot;
  <a href="CONTRIBUTING.md"><strong>Contributing</strong></a>
</p>

<p align="center">
  Create, update and safely rename labels from one configuration, with dry-run previews, optional pruning and multi-repository support.
</p>

# Label Blueprint

Manage labels in a GitHub repository from a declarative YAML or JSON file. The
action creates missing labels, updates changed labels and can safely rename
labels through aliases without removing them from issues and pull requests. The
same configuration can optionally be applied to multiple repositories.

## Features

- **Declarative Label Management**: Define the desired label state in a version-controlled YAML or JSON file.
- **Automatic Reconciliation**: Create missing labels and update names, colors and descriptions that have changed.
- **Assignment-Safe Renames**: Rename existing labels through aliases while preserving their issue and pull request assignments.
- **Non-Destructive by Default**: Keep unmanaged labels unless pruning is explicitly enabled.
- **Dry-Run Preview**: Review planned creates, updates, renames and deletions in the job summary before applying them.
- **Strict Validation**: Detect invalid colors, duplicate names and ambiguous aliases before repository changes start.
- **Workflow-Friendly Results**: Review synchronization counts in the job summary and consume them through action outputs.
- **Optional Multi-Repository Sync**: Apply the same label configuration to multiple repositories when needed.

## Quick start

By default, the action manages labels in the repository where the workflow
runs. This example reapplies the desired label state whenever its configuration
changes.

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
        uses: klaasnicolaas/action-label-blueprint@v1
```

`pull-requests: write` is not required: GitHub manages labels for issues and
pull requests through the Issues labels API.

The configuration is the desired state. Labels that do not exist are created,
changed labels are updated and aliases are renamed without losing their issue
or pull request assignments. Other labels remain untouched unless `prune` is
enabled.

## Advanced usage

### Preview and prune

Preview the exact changes without calling create, update or delete endpoints:

```yaml
- uses: klaasnicolaas/action-label-blueprint@v1
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
- uses: klaasnicolaas/action-label-blueprint@v1
  with:
    labels-file: https://raw.githubusercontent.com/owner/config/main/labels.yml
```

Remote files have a 15-second timeout and a 5 MiB size limit. Authentication
headers are not sent to remote URLs; check out private configuration files
before running the action.

### Multiple repositories

Set `repositories` to optionally apply the same configuration to more than one
repository. The default workflow token normally only has access to its own
repository, so use a GitHub App token or fine-grained personal access token
(PAT) with Issues write permission for every target.

```yaml
- uses: klaasnicolaas/action-label-blueprint@v1
  with:
    github-token: ${{ secrets.LABEL_SYNC_TOKEN }}
    repositories: |
      owner/first-repository
      owner/second-repository
    labels-file: .github/labels.yml
```

## Inputs

The following input parameters can be used to configure the action.

_If no input parameters are provided, the action will use the default values._

### `github-token`

The token used to manage labels through the GitHub API. For multi-repository
sync, it needs Issues write permission for every target repository.

- Default: `${{ github.token }}`
- Usage: **Optional**

### `labels-file`

The local path or HTTP(S) URL to a YAML or JSON label configuration.

- Default: `.github/labels.yml`
- Usage: **Optional**

### `repositories`

A comma- or newline-separated list of repositories in `owner/repository`
format. Leave this unset to manage the repository running the workflow.

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

