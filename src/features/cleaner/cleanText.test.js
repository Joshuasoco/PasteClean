import { describe, expect, it } from 'vitest'
import { cleanText, getDefaultCleaningOptions, syncCleaningOptionsForModeChange } from './cleanText'

describe('cleanText', () => {
  it('normalizes punctuation, decodes entities, and strips invisible chars', () => {
    const input = '“Hello”—&amp;&nbsp;world\u200B'
    const result = cleanText(input, 'plain', getDefaultCleaningOptions())

    expect(result.cleanedText).toBe('"Hello"-& world')
    expect(result.changed).toBe(true)
  })

  it('applies enabled custom find/replace rules and reports summary', () => {
    const options = {
      ...getDefaultCleaningOptions(),
      customRules: [
        { find: 'foo', replace: 'zip', enabled: true },
        { find: 'bar', replace: 'baz', enabled: false },
      ],
    }

    const result = cleanText('foo foo bar', 'plain', options)

    expect(result.cleanedText).toBe('zip zip bar')
    expect(result.customRuleSummary).toEqual({
      activeRules: 1,
      replacementsMade: 2,
    })
  })

  it('runs code-mode cleanup and url cleanup together', () => {
    const input = '1 | const docs = "https://example.com/New%20Drop?utm_source=mail&keep=1";'
    const result = cleanText(input, 'code', getDefaultCleaningOptions('code'))

    expect(result.cleanedText).toContain('const docs = "https://example.com/New%20Drop?utm_source=mail&keep=1";')
    expect(result.cleanedText).not.toContain('1 |')
    expect(result.urlSummary.trackingParamsRemoved).toBe(0)
  })

  it('lets mode defaults follow the selected mode without overwriting user overrides', () => {
    const nextDefaults = syncCleaningOptionsForModeChange(getDefaultCleaningOptions('plain'), 'plain', 'code')

    expect(nextDefaults.normalizePunctuation).toBe(false)
    expect(nextDefaults.decodeHtmlEntities).toBe(false)
    expect(nextDefaults.stripTrackingParams).toBe(false)

    const preservedOverride = syncCleaningOptionsForModeChange(
      {
        ...getDefaultCleaningOptions('plain'),
        normalizePunctuation: false,
      },
      'plain',
      'email'
    )

    expect(preservedOverride.normalizePunctuation).toBe(false)
    expect(preservedOverride.decodeHtmlEntities).toBe(true)
  })

  it('keeps code-safe defaults from rewriting string literal content', () => {
    const input = 'const label = "â€œHelloâ€ &amp; docs https://example.com/A%20B?utm_source=test&keep=1";'
    const result = cleanText(input, 'code', getDefaultCleaningOptions('code'))

    expect(result.cleanedText).toBe(input)
  })

  it('removes email reply chains in email mode', () => {
    const input = [
      'Hi team,',
      '',
      'Latest update is attached.',
      '',
      'On Tue, Apr 1, 2026 at 9:14 AM Morgan wrote:',
      '> Previous thread',
    ].join('\n')

    const result = cleanText(input, 'email', getDefaultCleaningOptions('email'))

    expect(result.cleanedText).toContain('Latest update is attached.')
    expect(result.cleanedText).not.toContain('Morgan wrote')
    expect(result.mode).toBe('email')
  })
})
