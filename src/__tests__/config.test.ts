import { describe, expect, it } from 'vitest'
import { parseLabelConfig } from '../config.js'

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
        JSON.stringify({ labels: [{ name: 'docs', color: '0075ca' }] }),
      ),
    ).toEqual([
      { name: 'docs', color: '0075ca', description: null, aliases: [] },
    ])
  })

  it.each([
    ['an empty document', '', 'Unable to parse label configuration'],
    ['an empty list', '[]', 'non-empty labels array'],
    ['an invalid color', '- name: bug\n  color: red', 'six-digit hexadecimal'],
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
      'an unknown field',
      '- name: bug\n  color: d73a4a\n  typo: value',
      'unknown field',
    ],
  ])('rejects %s', (_name, input, expected) => {
    expect(() => parseLabelConfig(input)).toThrow(expected)
  })
})
