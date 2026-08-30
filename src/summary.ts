import type { LabelChange } from './types.js'

export const MAX_DETAILED_CHANGES = 100

type ChangedLabelChange = Exclude<LabelChange, { kind: 'unchanged' }>

const ABSENT = '<em>absent</em>'
const NONE = '<em>none</em>'
const UNCHANGED = '—'

export interface RenderedChangeTable {
  html: string
  shown: number
  total: number
  truncated: boolean
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function renderIgnoredLabels(names: string[]): string {
  return `<ul>${names.map((value) => `<li>${name(value)}</li>`).join('')}</ul>`
}

function code(value: string): string {
  return `<code>${escapeHtml(value)}</code>`
}

function name(value: string): string {
  return code(value)
}

function color(value: string): string {
  return code(`#${value.toLowerCase()}`)
}

function description(value: string | null): string {
  return value === null ? NONE : code(value)
}

function transition(before: string, after: string): string {
  return `${before} → ${after}`
}

function updateTransition<T>(
  before: T,
  after: T,
  render: (value: T) => string,
): string {
  return before === after
    ? UNCHANGED
    : transition(render(before), render(after))
}

function renderChange(change: ChangedLabelChange): string[] {
  if (change.kind === 'create') {
    return [
      'Create',
      transition(ABSENT, name(change.label.name)),
      transition(ABSENT, color(change.label.color)),
      transition(ABSENT, description(change.label.description)),
    ]
  }

  if (change.kind === 'delete') {
    return [
      'Delete',
      transition(name(change.current.name), ABSENT),
      transition(color(change.current.color), ABSENT),
      transition(description(change.current.description), ABSENT),
    ]
  }

  const renamed = change.current.name !== change.label.name
  return [
    renamed ? 'Rename' : 'Update',
    renamed
      ? transition(name(change.current.name), name(change.label.name))
      : UNCHANGED,
    updateTransition(
      change.current.color.toLowerCase(),
      change.label.color.toLowerCase(),
      color,
    ),
    updateTransition(
      change.current.description,
      change.label.description,
      description,
    ),
  ]
}

function cell(tag: 'td' | 'th', value: string): string {
  return `<${tag}>${value}</${tag}>`
}

function row(values: string[], header = false): string {
  const tag = header ? 'th' : 'td'
  return `<tr>${values.map((value) => cell(tag, value)).join('')}</tr>`
}

export function renderChangeTable(
  changes: LabelChange[],
  limit = MAX_DETAILED_CHANGES,
): RenderedChangeTable {
  const changed = changes.filter(
    (change): change is ChangedLabelChange => change.kind !== 'unchanged',
  )
  const visible = changed.slice(0, Math.max(0, limit))
  const rows = visible.map(renderChange)
  const truncated = visible.length < changed.length
  const notice = truncated
    ? `<p><strong>Showing the first ${visible.length} of ${changed.length} changes.</strong></p>`
    : ''

  return {
    html:
      notice +
      `<table>${row(['Operation', 'Name', 'Color', 'Description'], true)}${rows.map((values) => row(values)).join('')}</table>`,
    shown: visible.length,
    total: changed.length,
    truncated,
  }
}
