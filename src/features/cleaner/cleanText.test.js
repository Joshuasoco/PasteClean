import { describe, expect, it } from 'vitest'
import { cleanText, getDefaultCleaningOptions, syncCleaningOptionsForModeChange } from './cleanText'

describe('cleanText', () => {
  it('normalizes punctuation, decodes entities, and strips invisible chars', () => {
    const input = '\u201CHello\u201D\u2014&amp;&nbsp;world\u200B'
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

  it('runs code-mode cleanup without rewriting URLs by default', () => {
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
    expect(nextDefaults.stripInvisibleChars).toBe(false)
    expect(nextDefaults.preserveCodeTokens).toBe(true)

    const preservedOverride = syncCleaningOptionsForModeChange(
      {
        ...getDefaultCleaningOptions('plain'),
        normalizePunctuation: false,
        preserveCodeTokens: false,
      },
      'plain',
      'email'
    )

    expect(preservedOverride.normalizePunctuation).toBe(false)
    expect(preservedOverride.decodeHtmlEntities).toBe(true)
    expect(preservedOverride.preserveCodeTokens).toBe(false)
  })

  it('keeps code-safe defaults from rewriting single-line string literal content', () => {
    const input = 'const label = "&amp; https://example.com/A%20B?utm_source=test&keep=1";'
    const result = cleanText(input, 'code', getDefaultCleaningOptions('code'))

    expect(result.cleanedText).toBe(input)
  })

  it('preserves multiline string literal content while still removing copied line numbers', () => {
    const input = [
      '1 | const message = `',
      '2 | Hello from code mode  ',
      '3 | ',
      '4 | Visit https://example.com/A%20B?utm_source=test&keep=1 &amp;',
      '5 | `;',
    ].join('\n')

    const result = cleanText(input, 'code', getDefaultCleaningOptions('code'))
    const expected = [
      'const message = `',
      'Hello from code mode  ',
      '',
      'Visit https://example.com/A%20B?utm_source=test&keep=1 &amp;',
      '`;',
    ].join('\n')

    expect(result.cleanedText).toBe(expected)
    expect(result.modeSummary.stats).toContainEqual({ label: 'Code-safe path', value: 'On' })
  })

  it('allows destructive string cleanup only when code-safe preservation is explicitly disabled', () => {
    const result = cleanText(
      'const docs = "&amp; https://example.com/A%20B?utm_source=test&keep=1";',
      'code',
      {
        ...getDefaultCleaningOptions('code'),
        preserveCodeTokens: false,
        decodeHtmlEntities: true,
        stripTrackingParams: true,
        unwrapRedirects: true,
        decodeReadableUrls: true,
      }
    )

    expect(result.cleanedText).toBe('const docs = "& https://example.com/A B?keep=1";')
    expect(result.modeSummary.stats).toContainEqual({ label: 'Code-safe path', value: 'Off' })
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

  it('removes Outlook-style multi-line reply header blocks', () => {
    const input = [
      'Hi team,',
      '',
      'Here is the newest update.',
      '',
      'From: Morgan Lee <morgan@example.com>',
      'Sent: Tuesday, April 1, 2026 9:14 AM',
      'To: Alex Stone <alex@example.com>',
      'Subject: Re: Launch readiness',
      '',
      'Older reply content',
    ].join('\n')

    const result = cleanText(input, 'email', getDefaultCleaningOptions('email'))

    expect(result.cleanedText).toBe('Hi team,\n\nHere is the newest update.')
    expect(result.modeSummary.stats).toContainEqual({ label: 'Reply format detected', value: 'Quoted header block' })
    expect(result.modeSummary.stats).toContainEqual({ label: 'Header lines removed', value: 4 })
  })

  it('removes Apple Mail style reply header blocks', () => {
    const input = [
      'Latest notes are below.',
      '',
      'From: Morgan Lee <morgan@example.com>',
      'Date: Tue, Apr 1, 2026 at 9:14 AM',
      'To: Alex Stone <alex@example.com>',
      'Subject: Re: Launch readiness',
      '',
      'Previous email body',
    ].join('\n')

    const result = cleanText(input, 'email', getDefaultCleaningOptions('email'))

    expect(result.cleanedText).toBe('Latest notes are below.')
    expect(result.cleanedText).not.toContain('Previous email body')
  })

  it('avoids false positives for normal Subject and From lines in the latest message', () => {
    const input = [
      'Subject: Launch readiness',
      'From: customer interviews, we learned the onboarding copy is unclear.',
      '',
      'Please keep both lines in the cleaned output.',
    ].join('\n')

    const result = cleanText(input, 'email', getDefaultCleaningOptions('email'))

    expect(result.cleanedText).toContain('Subject: Launch readiness')
    expect(result.cleanedText).toContain('From: customer interviews, we learned the onboarding copy is unclear.')
    expect(result.modeSummary.stats).toContainEqual({ label: 'Reply chain removed', value: 'No' })
  })

  it('removes mobile-style On ... wrote reply separators', () => {
    const input = [
      'Quick update before I head out.',
      '',
      'On Tue, Apr 1, 2026, at 9:14 AM, Morgan Lee <morgan@example.com> wrote:',
      '> Previous thread',
    ].join('\n')

    const result = cleanText(input, 'email', getDefaultCleaningOptions('email'))

    expect(result.cleanedText).toBe('Quick update before I head out.')
    expect(result.modeSummary.stats).toContainEqual({ label: 'Reply format detected', value: 'Reply separator' })
  })

  it('cleans markdown prose while preserving fenced code blocks and inline code spans', () => {
    const input = [
      '##Heading',
      '',
      'Visit “docs” at https://example.com/A%20B?utm_source=test&keep=1 and use `https://example.com/C%20D?utm_source=code&keep=1`.',
      '',
      '```js',
      'const docs = "https://example.com/A%20B?utm_source=test&keep=1";  ',
      'const title = "&amp;";',
      '```',
    ].join('\n')

    const result = cleanText(input, 'markdown', getDefaultCleaningOptions('markdown'))

    expect(result.cleanedText).toContain('## Heading')
    expect(result.cleanedText).toContain('https://example.com/A B?keep=1')
    expect(result.cleanedText).toContain('`https://example.com/C%20D?utm_source=code&keep=1`')
    expect(result.cleanedText).toContain('const docs = "https://example.com/A%20B?utm_source=test&keep=1";  ')
    expect(result.cleanedText).toContain('const title = "&amp;";')
    expect(result.modeSummary.stats).toContainEqual({ label: 'Protected code regions', value: 2 })
  })

  it('allows markdown code regions to be cleaned when protection is explicitly disabled', () => {
    const result = cleanText(
      [
        'Use `https://example.com/C%20D?utm_source=code&keep=1`',
        '',
        '```js',
        'const title = "&amp;";',
        '```',
      ].join('\n'),
      'markdown',
      {
        ...getDefaultCleaningOptions('markdown'),
        preserveMarkdownCode: false,
      }
    )

    expect(result.cleanedText).toContain('`https://example.com/C D?keep=1`')
    expect(result.cleanedText).toContain('const title = "&";')
  })
})
