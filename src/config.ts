import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { load } from 'js-yaml'
import type { LabelDefinition } from './types.js'

const COLOR_PATTERN = /^[0-9a-f]{6}$/i
const MAX_CONFIG_SIZE = 5 * 1024 * 1024

function asRecord(value: unknown, location: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${location} must be an object`)
  }
  return value as Record<string, unknown>
}

function validateName(value: unknown, location: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${location} must be a string`)
  }
  const name = value.trim()
  if (name.length < 1 || name.length > 50) {
    throw new Error(`${location} must contain between 1 and 50 characters`)
  }
  return name
}

function validateLabel(value: unknown, index: number): LabelDefinition {
  const location = `labels[${index}]`
  const label = asRecord(value, location)
  const allowed = new Set(['name', 'color', 'description', 'aliases'])
  const unexpected = Object.keys(label).filter((key) => !allowed.has(key))
  if (unexpected.length > 0) {
    throw new Error(
      `${location} contains unknown field(s): ${unexpected.join(', ')}`,
    )
  }

  const name = validateName(label.name, `${location}.name`)
  if (typeof label.color !== 'string') {
    throw new Error(`${location}.color must be a string`)
  }
  const color = label.color.trim().replace(/^#/, '').toLowerCase()
  if (!COLOR_PATTERN.test(color)) {
    throw new Error(`${location}.color must be a six-digit hexadecimal color`)
  }

  let description: string | null = null
  if (label.description !== undefined && label.description !== null) {
    if (typeof label.description !== 'string') {
      throw new Error(`${location}.description must be a string or null`)
    }
    const normalizedDescription = label.description.trim()
    if (normalizedDescription.length > 100) {
      throw new Error(`${location}.description cannot exceed 100 characters`)
    }
    description = normalizedDescription || null
  }

  let aliases: string[] = []
  if (label.aliases !== undefined) {
    if (!Array.isArray(label.aliases)) {
      throw new Error(`${location}.aliases must be an array of strings`)
    }
    aliases = label.aliases.map((alias, aliasIndex) =>
      validateName(alias, `${location}.aliases[${aliasIndex}]`),
    )
  }

  const uniqueAliases = new Map<string, string>()
  for (const alias of aliases) {
    const key = alias.toLocaleLowerCase('en-US')
    if (key === name.toLocaleLowerCase('en-US')) {
      throw new Error(`${location}.aliases cannot contain its own label name`)
    }
    if (uniqueAliases.has(key)) {
      throw new Error(`${location}.aliases contains duplicate alias: ${alias}`)
    }
    uniqueAliases.set(key, alias)
  }

  return { name, color, description, aliases: [...uniqueAliases.values()] }
}

export function parseLabelConfig(content: string): LabelDefinition[] {
  let parsed: unknown
  try {
    parsed = load(content)
  } catch (error) {
    throw new Error(
      `Unable to parse label configuration: ${(error as Error).message}`,
    )
  }

  const values = Array.isArray(parsed)
    ? parsed
    : asRecord(parsed, 'configuration').labels
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('configuration must contain a non-empty labels array')
  }

  const labels = values.map(validateLabel)
  const desiredNames = new Map<string, string>()
  const aliases = new Map<string, string>()

  for (const label of labels) {
    const nameKey = label.name.toLocaleLowerCase('en-US')
    const duplicate = desiredNames.get(nameKey)
    if (duplicate) {
      throw new Error(`duplicate label names: ${duplicate} and ${label.name}`)
    }
    desiredNames.set(nameKey, label.name)
  }

  for (const label of labels) {
    for (const alias of label.aliases) {
      const aliasKey = alias.toLocaleLowerCase('en-US')
      const desired = desiredNames.get(aliasKey)
      if (desired) {
        throw new Error(
          `alias ${alias} conflicts with configured label ${desired}`,
        )
      }
      const owner = aliases.get(aliasKey)
      if (owner) {
        throw new Error(
          `alias ${alias} is assigned to both ${owner} and ${label.name}`,
        )
      }
      aliases.set(aliasKey, label.name)
    }
  }

  return labels
}

async function readRemoteConfig(source: string): Promise<string> {
  const response = await fetch(source, {
    headers: {
      accept: 'application/json, application/yaml, text/yaml, text/plain',
    },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) {
    throw new Error(`Unable to fetch ${source}: HTTP ${response.status}`)
  }
  const contentLength = Number(response.headers.get('content-length') ?? 0)
  if (contentLength > MAX_CONFIG_SIZE) {
    throw new Error(`Configuration exceeds the ${MAX_CONFIG_SIZE} byte limit`)
  }
  const content = await response.text()
  if (Buffer.byteLength(content) > MAX_CONFIG_SIZE) {
    throw new Error(`Configuration exceeds the ${MAX_CONFIG_SIZE} byte limit`)
  }
  return content
}

export async function loadLabelConfig(
  source: string,
): Promise<LabelDefinition[]> {
  const location = source.trim()
  if (!location) {
    throw new Error('labels-file cannot be empty')
  }
  const content = /^https?:\/\//i.test(location)
    ? await readRemoteConfig(location)
    : await readFile(resolve(process.cwd(), location), 'utf8')
  return parseLabelConfig(content)
}
