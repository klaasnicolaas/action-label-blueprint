import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { load } from 'js-yaml'
import type { LabelDefinition } from './types.js'

const COLOR_PATTERN = /^[0-9a-f]{6}$/i
export const MAX_CONFIG_DEPTH = 10
export const MAX_CONFIG_SIZE = 5 * 1024 * 1024
export const CONFIG_TIMEOUT_MS = 15_000

interface PartialLabelDefinition {
  name: string
  color?: string
  description?: string | null
  aliases?: string[]
}

interface BlueprintDocument {
  extends: string[]
  labels: PartialLabelDefinition[]
}

interface ConfigSource {
  location: string
  remote: boolean
}

interface LoadContext {
  signal: AbortSignal
  loadedBytes: number
  cache: Map<string, PartialLabelDefinition[]>
}

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

function validateColor(value: unknown, location: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${location} must be a string`)
  }
  const color = value.trim().replace(/^#/, '').toLowerCase()
  if (!COLOR_PATTERN.test(color)) {
    throw new Error(`${location} must be a six-digit hexadecimal color`)
  }
  return color
}

function validateDescription(value: unknown, location: string): string | null {
  if (value === undefined || value === null) {
    return null
  }
  if (typeof value !== 'string') {
    throw new Error(`${location} must be a string or null`)
  }
  const description = value.trim()
  if (description.length > 100) {
    throw new Error(`${location} cannot exceed 100 characters`)
  }
  return description || null
}

function validateAliases(
  value: unknown,
  labelName: string,
  location: string,
): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${location} must be an array of strings`)
  }
  const aliases = value.map((alias, index) =>
    validateName(alias, `${location}[${index}]`),
  )
  const uniqueAliases = new Map<string, string>()
  for (const alias of aliases) {
    const key = alias.toLocaleLowerCase('en-US')
    if (key === labelName.toLocaleLowerCase('en-US')) {
      throw new Error(`${location} cannot contain its own label name`)
    }
    if (uniqueAliases.has(key)) {
      throw new Error(`${location} contains duplicate alias: ${alias}`)
    }
    uniqueAliases.set(key, alias)
  }
  return [...uniqueAliases.values()]
}

function validatePartialLabel(
  value: unknown,
  index: number,
): PartialLabelDefinition {
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
  const result: PartialLabelDefinition = { name }
  if (Object.hasOwn(label, 'color')) {
    result.color = validateColor(label.color, `${location}.color`)
  }
  if (Object.hasOwn(label, 'description')) {
    result.description = validateDescription(
      label.description,
      `${location}.description`,
    )
  }
  if (Object.hasOwn(label, 'aliases')) {
    result.aliases = validateAliases(
      label.aliases,
      name,
      `${location}.aliases`,
    )
  }
  return result
}

function parseExtends(value: unknown): string[] {
  if (value === undefined) {
    return []
  }
  const sources = typeof value === 'string' ? [value] : value
  if (!Array.isArray(sources)) {
    throw new Error('configuration.extends must be a string or array of strings')
  }
  return sources.map((source, index) => {
    if (typeof source !== 'string' || source.trim() === '') {
      throw new Error(`configuration.extends[${index}] must be a non-empty string`)
    }
    return source.trim()
  })
}

function parseBlueprint(content: string): BlueprintDocument {
  let parsed: unknown
  try {
    parsed = load(content)
  } catch (error) {
    throw new Error(
      `Unable to parse label configuration: ${(error as Error).message}`,
    )
  }

  const configuration = Array.isArray(parsed)
    ? { labels: parsed }
    : asRecord(parsed, 'configuration')
  const rawLabels = configuration.labels ?? []
  if (!Array.isArray(rawLabels)) {
    throw new Error('configuration.labels must be an array')
  }
  const labels = rawLabels.map(validatePartialLabel)
  const names = new Map<string, string>()
  for (const label of labels) {
    const key = label.name.toLocaleLowerCase('en-US')
    const duplicate = names.get(key)
    if (duplicate) {
      throw new Error(`duplicate label names: ${duplicate} and ${label.name}`)
    }
    names.set(key, label.name)
  }

  return {
    extends: parseExtends(configuration.extends),
    labels,
  }
}

function validateMergedLabels(
  values: PartialLabelDefinition[],
): LabelDefinition[] {
  if (values.length === 0) {
    throw new Error('configuration must contain a non-empty labels array')
  }

  const labels = values.map((label, index) => {
    const location = `labels[${index}]`
    if (label.color === undefined) {
      throw new Error(`${location}.color must be a string`)
    }
    return {
      name: label.name,
      color: label.color,
      description: label.description ?? null,
      aliases: label.aliases ?? [],
    }
  })
  const desiredNames = new Map<string, string>()
  const aliases = new Map<string, string>()

  for (const label of labels) {
    desiredNames.set(label.name.toLocaleLowerCase('en-US'), label.name)
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

export function parseLabelConfig(content: string): LabelDefinition[] {
  const blueprint = parseBlueprint(content)
  if (blueprint.extends.length > 0) {
    throw new Error('configuration.extends requires loadLabelConfig')
  }
  return validateMergedLabels(blueprint.labels)
}

function sourceFrom(location: string, importer?: ConfigSource): ConfigSource {
  if (/^https?:\/\//i.test(location)) {
    return { location: new URL(location).toString(), remote: true }
  }
  if (importer?.remote) {
    const url = new URL(location, importer.location)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`Unsupported configuration URL: ${url.toString()}`)
    }
    return { location: url.toString(), remote: true }
  }
  return {
    location: resolve(importer ? dirname(importer.location) : process.cwd(), location),
    remote: false,
  }
}

function accountForSize(context: LoadContext, content: string): void {
  context.loadedBytes += Buffer.byteLength(content)
  if (context.loadedBytes > MAX_CONFIG_SIZE) {
    throw new Error(
      `Combined configuration exceeds the ${MAX_CONFIG_SIZE} byte limit`,
    )
  }
}

async function readRemoteConfig(
  source: ConfigSource,
  context: LoadContext,
): Promise<string> {
  const response = await fetch(source.location, {
    headers: {
      accept: 'application/json, application/yaml, text/yaml, text/plain',
    },
    signal: context.signal,
  })
  if (!response.ok) {
    throw new Error(`Unable to fetch ${source.location}: HTTP ${response.status}`)
  }
  const contentLength = Number(response.headers.get('content-length') ?? 0)
  if (
    Number.isFinite(contentLength) &&
    context.loadedBytes + contentLength > MAX_CONFIG_SIZE
  ) {
    throw new Error(
      `Combined configuration exceeds the ${MAX_CONFIG_SIZE} byte limit`,
    )
  }
  return response.text()
}

async function readConfig(
  source: ConfigSource,
  context: LoadContext,
): Promise<string> {
  try {
    const content = source.remote
      ? await readRemoteConfig(source, context)
      : await readFile(source.location, {
          encoding: 'utf8',
          signal: context.signal,
        })
    accountForSize(context, content)
    return content
  } catch (error) {
    if (context.signal.aborted) {
      throw new Error(
        `Configuration loading exceeded the ${CONFIG_TIMEOUT_MS / 1000} second timeout`,
      )
    }
    throw error
  }
}

function mergeLabels(
  target: Map<string, PartialLabelDefinition>,
  labels: PartialLabelDefinition[],
): void {
  for (const label of labels) {
    const key = label.name.toLocaleLowerCase('en-US')
    target.set(key, { ...target.get(key), ...label })
  }
}

async function loadBlueprint(
  source: ConfigSource,
  context: LoadContext,
  chain: string[],
): Promise<PartialLabelDefinition[]> {
  if (chain.includes(source.location)) {
    throw new Error(
      `Configuration cycle detected: ${[...chain, source.location].join(' -> ')}`,
    )
  }
  if (chain.length >= MAX_CONFIG_DEPTH) {
    throw new Error(
      `Configuration extends depth exceeds ${MAX_CONFIG_DEPTH}: ${[...chain, source.location].join(' -> ')}`,
    )
  }
  const cached = context.cache.get(source.location)
  if (cached) {
    return cached
  }

  const content = await readConfig(source, context)
  const blueprint = parseBlueprint(content)
  const merged = new Map<string, PartialLabelDefinition>()
  const nextChain = [...chain, source.location]
  for (const importedLocation of blueprint.extends) {
    mergeLabels(
      merged,
      await loadBlueprint(
        sourceFrom(importedLocation, source),
        context,
        nextChain,
      ),
    )
  }
  mergeLabels(merged, blueprint.labels)
  const labels = [...merged.values()]
  context.cache.set(source.location, labels)
  return labels
}

export async function loadLabelConfig(
  source: string,
): Promise<LabelDefinition[]> {
  const location = source.trim()
  if (!location) {
    throw new Error('labels-file cannot be empty')
  }
  const context: LoadContext = {
    signal: AbortSignal.timeout(CONFIG_TIMEOUT_MS),
    loadedBytes: 0,
    cache: new Map(),
  }
  return validateMergedLabels(
    await loadBlueprint(sourceFrom(location), context, []),
  )
}
