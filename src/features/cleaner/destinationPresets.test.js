import { describe, expect, it } from 'vitest'
import { applyDestinationPreset, getDestinationPresetDefinition } from './destinationPresets'

describe('destinationPresets', () => {
  it('falls back to the default destination preset', () => {
    expect(getDestinationPresetDefinition('missing').id).toBe('none')
  })

  it('joins wrapped prose for docs destinations', () => {
    const result = applyDestinationPreset(
      'This paragraph was copied from a narrow layout and\nshould become one readable paragraph.\n\n- Keep this list item\n- And this one',
      'docs'
    )

    expect(result.text).toContain('layout and should become one readable paragraph.')
    expect(result.text).toContain('- Keep this list item')
    expect(result.summary.stats).toContainEqual({ label: 'Wrapped prose lines joined', value: 1 })
  })

  it('normalizes bullets for markdown destinations', () => {
    const result = applyDestinationPreset('• First point\n• Second point', 'markdown')

    expect(result.text).toBe('- First point\n- Second point')
    expect(result.summary.changesApplied).toBeGreaterThan(0)
  })

  it('splits dense paragraphs for linkedin destinations', () => {
    const result = applyDestinationPreset(
      'PasteClean makes copied text easier to publish. It keeps edits understandable. It also turns dense blocks into shorter sections when you want social-ready output.',
      'linkedin'
    )

    expect(result.text).toContain('\n\n')
    expect(result.summary.stats).toContainEqual({
      label: 'Dense paragraphs split into shorter blocks',
      value: 1,
    })
  })
})
