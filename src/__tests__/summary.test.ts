import { describe, expect, it } from 'vitest'
import {
  escapeHtml,
  MAX_DETAILED_CHANGES,
  renderChangeTable,
} from '../summary.js'
import type { LabelChange } from '../types.js'

const changes: LabelChange[] = [
  {
    kind: 'create',
    name: 'bug <script>',
    label: {
      name: 'bug <script>',
      color: 'D73A4A',
      description: 'Fix **everything** & <nothing>',
      aliases: [],
    },
  },
  {
    kind: 'update',
    name: 'documentation',
    previousName: 'docs | old',
    current: {
      name: 'docs | old',
      color: 'ffffff',
      description: 'Documentation',
    },
    label: {
      name: 'documentation',
      color: '0075CA',
      description: 'Documentation',
      aliases: ['docs | old'],
    },
  },
  {
    kind: 'update',
    name: 'priority',
    previousName: 'priority',
    current: {
      name: 'priority',
      color: 'fbca04',
      description: 'Old "description"',
    },
    label: {
      name: 'priority',
      color: 'fbca04',
      description: "New 'description'",
      aliases: [],
    },
  },
  {
    kind: 'delete',
    name: 'stale',
    current: {
      name: 'stale',
      color: '000000',
      description: null,
    },
  },
  {
    kind: 'unchanged',
    name: 'keep',
    current: {
      name: 'keep',
      color: 'ffffff',
      description: null,
    },
    label: {
      name: 'keep',
      color: 'ffffff',
      description: null,
      aliases: [],
    },
  },
]

describe('escapeHtml', () => {
  it('escapes HTML-significant characters', () => {
    expect(escapeHtml(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&#39;')
  })
})

describe('renderChangeTable', () => {
  it('renders every change type with readable colors and safe values', () => {
    const rendered = renderChangeTable(changes)

    expect(rendered).toMatchObject({
      shown: 4,
      total: 4,
      truncated: false,
    })
    expect(rendered.html).toContain('<td>Create</td>')
    expect(rendered.html).toContain('<td>Rename</td>')
    expect(rendered.html).toContain('<td>Update</td>')
    expect(rendered.html).toContain('<td>Delete</td>')
    expect(rendered.html).toContain('<code>#d73a4a</code>')
    expect(rendered.html).toContain('bug &lt;script&gt;')
    expect(rendered.html).toContain('Fix **everything** &amp; &lt;nothing&gt;')
    expect(rendered.html).not.toContain('<script>')
    expect(rendered.html).not.toContain('<td>keep</td>')
  })

  it('shows only changed fields for updates', () => {
    const rendered = renderChangeTable(changes)

    expect(rendered.html).toContain(
      '<td>Rename</td><td><code>docs | old</code> → <code>documentation</code></td><td><code>#ffffff</code> → <code>#0075ca</code></td><td>—</td>',
    )
    expect(rendered.html).toContain(
      '<td>Update</td><td>—</td><td>—</td><td><code>Old &quot;description&quot;</code> → <code>New &#39;description&#39;</code></td>',
    )
  })

  it('truncates large plans with a clear notice', () => {
    const repeated = Array.from(
      { length: MAX_DETAILED_CHANGES + 1 },
      (_, index): LabelChange => ({
        kind: 'create',
        name: `label-${index}`,
        label: {
          name: `label-${index}`,
          color: 'ffffff',
          description: null,
          aliases: [],
        },
      }),
    )

    const rendered = renderChangeTable(repeated)

    expect(rendered).toMatchObject({
      shown: MAX_DETAILED_CHANGES,
      total: MAX_DETAILED_CHANGES + 1,
      truncated: true,
    })
    expect(rendered.html).toContain(
      `Showing the first ${MAX_DETAILED_CHANGES} of ${MAX_DETAILED_CHANGES + 1} changes.`,
    )
    expect(rendered.html).not.toContain(
      `<code>label-${MAX_DETAILED_CHANGES}</code>`,
    )
  })
})
