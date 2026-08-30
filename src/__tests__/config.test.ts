import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  loadLabelConfig,
  MAX_CONFIG_DEPTH,
  MAX_CONFIG_SIZE,
  parseLabelConfig,
} from '../config.js'

const temporaryDirectories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'label-blueprint-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('parseLabelConfig', () => {
  it('normalizes a YAML label list', () => {
    expect(
      parseLabelConfig(`
- name: Bug
  color: '#D73A4A'
  description: ' Something is broken '
  aliases: [defect]
`),
    ).toEqual([
      {
        name: 'Bug',
        color: 'd73a4a',
        description: 'Something is broken',
        aliases: ['defect'],
      },
    ])
  })

  it('accepts a labels wrapper and JSON syntax', () => {
    expect(
      parseLabelConfig(
        JSON.stringify({
          labels: [{ name: 'docs', color: '0075ca', description: null }],
        }),
      ),
    ).toEqual([
      { name: 'docs', color: '0075ca', description: null, aliases: [] },
    ])
  })

  it.each([
    ['an empty document', '', 'Unable to parse label configuration'],
    ['an empty list', '[]', 'non-empty labels array'],
    ['a non-object label', '- invalid', 'labels[0] must be an object'],
    [
      'a non-string name',
      '- name: 123\n  color: d73a4a',
      'name must be a string',
    ],
    ['an empty name', "- name: '  '\n  color: d73a4a", 'between 1 and 50'],
    [
      'a non-string color',
      '- name: bug\n  color: 123456',
      'color must be a string',
    ],
    ['an invalid color', '- name: bug\n  color: red', 'six-digit hexadecimal'],
    [
      'a non-string description',
      '- name: bug\n  color: d73a4a\n  description: 123',
      'description must be a string or null',
    ],
    [
      'an overly long description',
      `- name: bug\n  color: d73a4a\n  description: ${'x'.repeat(101)}`,
      'description cannot exceed 100 characters',
    ],
    [
      'non-array aliases',
      '- name: bug\n  color: d73a4a\n  aliases: defect',
      'aliases must be an array of strings',
    ],
    [
      'its own name as an alias',
      '- name: bug\n  color: d73a4a\n  aliases: [BUG]',
      'cannot contain its own label name',
    ],
    [
      'duplicate aliases',
      '- name: bug\n  color: d73a4a\n  aliases: [defect, DEFECT]',
      'contains duplicate alias',
    ],
    [
      'case-insensitive duplicate names',
      '- name: bug\n  color: d73a4a\n- name: BUG\n  color: ffffff',
      'duplicate label names',
    ],
    [
      'an alias that is also a desired label',
      '- name: bug\n  color: d73a4a\n  aliases: [defect]\n- name: defect\n  color: ffffff',
      'conflicts with configured label',
    ],
    [
      'an alias assigned to multiple labels',
      '- name: bug\n  color: d73a4a\n  aliases: [legacy]\n- name: docs\n  color: 0075ca\n  aliases: [LEGACY]',
      'is assigned to both bug and docs',
    ],
    [
      'an unknown field',
      '- name: bug\n  color: d73a4a\n  typo: value',
      'unknown field',
    ],
  ])('rejects %s', (_name, input, expected) => {
    expect(() => parseLabelConfig(input)).toThrow(expected)
  })

  it('requires asynchronous loading for extends', () => {
    expect(() =>
      parseLabelConfig(
        'extends: ./base.yml\nlabels:\n  - name: bug\n    color: d73a4a\n',
      ),
    ).toThrow('configuration.extends requires loadLabelConfig')
  })

  it.each([
    ['an object', 'extends: {}\n', 'must be a string or array of strings'],
    ['an empty source', "extends: ['  ']\n", 'must be a non-empty string'],
    [
      'non-array labels',
      'labels: {}\n',
      'configuration.labels must be an array',
    ],
  ])('rejects %s for composition fields', (_name, input, expected) => {
    expect(() => parseLabelConfig(input)).toThrow(expected)
  })
})

describe('loadLabelConfig', () => {
  it('merges local bases in order and applies field-level child overrides', async () => {
    const directory = await temporaryDirectory()
    const shared = join(directory, 'shared')
    const repository = join(directory, 'repository')
    await mkdir(shared)
    await mkdir(repository)
    await writeFile(
      join(shared, 'foundation.yml'),
      `labels:
  - name: bug
    color: d73a4a
    description: Foundation description
    aliases: [defect]
  - name: documentation
    color: 0075ca
`,
    )
    await writeFile(
      join(shared, 'engineering.yml'),
      `extends: ./foundation.yml
labels:
  - name: BUG
    description: Engineering description
  - name: enhancement
    color: a2eeef
`,
    )
    await writeFile(
      join(repository, 'labels.yml'),
      `extends:
  - ../shared/foundation.yml
  - ../shared/engineering.yml
labels:
  - name: bug
    color: '5319e7'
    aliases: []
  - name: hardware
    color: c5def5
`,
    )

    await expect(
      loadLabelConfig(join(repository, 'labels.yml')),
    ).resolves.toEqual([
      {
        name: 'bug',
        color: '5319e7',
        description: 'Engineering description',
        aliases: [],
      },
      {
        name: 'documentation',
        color: '0075ca',
        description: null,
        aliases: [],
      },
      {
        name: 'enhancement',
        color: 'a2eeef',
        description: null,
        aliases: [],
      },
      {
        name: 'hardware',
        color: 'c5def5',
        description: null,
        aliases: [],
      },
    ])
  })

  it('normalizes duplicate sources without duplicating labels', async () => {
    const directory = await temporaryDirectory()
    await mkdir(join(directory, 'nested'))
    await writeFile(
      join(directory, 'base.yml'),
      '- name: bug\n  color: d73a4a\n',
    )
    await writeFile(
      join(directory, 'labels.yml'),
      `extends:
  - ./base.yml
  - ./nested/../base.yml
labels:
  - name: documentation
    color: 0075ca
`,
    )

    const labels = await loadLabelConfig(join(directory, 'labels.yml'))

    expect(labels.map((label) => label.name)).toEqual(['bug', 'documentation'])
  })

  it('reports the complete normalized import chain for cycles', async () => {
    const directory = await temporaryDirectory()
    const first = join(directory, 'first.yml')
    const second = join(directory, 'second.yml')
    await writeFile(first, 'extends: ./second.yml\n')
    await writeFile(second, 'extends: ./first.yml\n')

    await expect(loadLabelConfig(first)).rejects.toThrow(
      `Configuration cycle detected: ${first} -> ${second} -> ${first}`,
    )
  })

  it('enforces the maximum import depth', async () => {
    const directory = await temporaryDirectory()
    for (let index = 0; index < MAX_CONFIG_DEPTH; index += 1) {
      const content =
        index < MAX_CONFIG_DEPTH - 1
          ? `extends: ./level-${index + 1}.yml\n`
          : 'labels:\n  - name: bug\n    color: d73a4a\n'
      await writeFile(join(directory, `level-${index}.yml`), content)
    }

    await expect(
      loadLabelConfig(join(directory, 'level-0.yml')),
    ).resolves.toHaveLength(1)

    await writeFile(
      join(directory, `level-${MAX_CONFIG_DEPTH - 1}.yml`),
      `extends: ./level-${MAX_CONFIG_DEPTH}.yml\n`,
    )
    await writeFile(
      join(directory, `level-${MAX_CONFIG_DEPTH}.yml`),
      'labels:\n  - name: bug\n    color: d73a4a\n',
    )
    await expect(
      loadLabelConfig(join(directory, 'level-0.yml')),
    ).rejects.toThrow(`Configuration extends depth exceeds ${MAX_CONFIG_DEPTH}`)
  })

  it('resolves remote imports relative to their importer without authentication', async () => {
    const responses = new Map([
      [
        'https://example.com/config/labels.yml',
        `extends:
  - ./base.yml
  - https://cdn.example.com/team.yml
labels:
  - name: bug
    description: Repository override
`,
      ],
      [
        'https://example.com/config/base.yml',
        '- name: bug\n  color: d73a4a\n  aliases: [defect]\n',
      ],
      [
        'https://cdn.example.com/team.yml',
        '- name: documentation\n  color: 0075ca\n',
      ],
    ])
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const content = responses.get(String(input))
      return new Response(content ?? '', { status: content ? 200 : 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      loadLabelConfig('https://example.com/config/labels.yml'),
    ).resolves.toEqual([
      {
        name: 'bug',
        color: 'd73a4a',
        description: 'Repository override',
        aliases: ['defect'],
      },
      {
        name: 'documentation',
        color: '0075ca',
        description: null,
        aliases: [],
      },
    ])
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      'https://example.com/config/labels.yml',
      'https://example.com/config/base.yml',
      'https://cdn.example.com/team.yml',
    ])
    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.headers).toEqual({
        accept: 'application/json, application/yaml, text/yaml, text/plain',
      })
      expect(init?.signal).toBeInstanceOf(AbortSignal)
    }
    expect(
      new Set(fetchMock.mock.calls.map(([, init]) => init?.signal)).size,
    ).toBe(1)
  })

  it('enforces the combined configuration size limit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        if (String(input).endsWith('/root.yml')) {
          return new Response('extends: ./base.yml\n')
        }
        return new Response('', {
          headers: { 'content-length': String(MAX_CONFIG_SIZE) },
        })
      }),
    )

    await expect(
      loadLabelConfig('https://example.com/root.yml'),
    ).rejects.toThrow(
      `Combined configuration exceeds the ${MAX_CONFIG_SIZE} byte limit`,
    )
  })

  it('enforces the size limit when content-length is omitted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(`#${'x'.repeat(MAX_CONFIG_SIZE)}\n`)),
    )

    await expect(
      loadLabelConfig('https://example.com/labels.yml'),
    ).rejects.toThrow(
      `Combined configuration exceeds the ${MAX_CONFIG_SIZE} byte limit`,
    )
  })

  it('reports remote HTTP failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    )

    await expect(
      loadLabelConfig('https://example.com/missing.yml'),
    ).rejects.toThrow(
      'Unable to fetch https://example.com/missing.yml: HTTP 404',
    )
  })

  it('rejects non-HTTP imports from remote configurations', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('extends: ftp://example.com/base.yml\n')),
    )

    await expect(
      loadLabelConfig('https://example.com/labels.yml'),
    ).rejects.toThrow(
      'Unsupported configuration URL: ftp://example.com/base.yml',
    )
  })

  it('applies one timeout to the complete loading operation', async () => {
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(AbortSignal.abort())
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('aborted')
      }),
    )

    await expect(
      loadLabelConfig('https://example.com/labels.yml'),
    ).rejects.toThrow('Configuration loading exceeded the 15 second timeout')
  })

  it('validates the fully merged configuration', async () => {
    const directory = await temporaryDirectory()
    await writeFile(
      join(directory, 'base.yml'),
      '- name: bug\n  aliases: [defect]\n',
    )
    await writeFile(
      join(directory, 'labels.yml'),
      'extends: ./base.yml\nlabels: []\n',
    )

    await expect(
      loadLabelConfig(join(directory, 'labels.yml')),
    ).rejects.toThrow('labels[0].color must be a string')
  })

  it('rejects an empty root source', async () => {
    await expect(loadLabelConfig('   ')).rejects.toThrow(
      'labels-file cannot be empty',
    )
  })
})
