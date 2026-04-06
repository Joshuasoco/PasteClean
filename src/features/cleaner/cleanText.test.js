import { describe, expect, it } from 'vitest'
import { cleanText, getDefaultCleaningOptions, syncCleaningOptionsForModeChange } from './cleanText'

describe('cleanText', () => {
  it('normalizes punctuation, decodes entities, and strips invisible chars', () => {
    const input = '\u201CHello\u201D\u2014&amp;&nbsp;world\u200B'
    const result = cleanText(input, 'plain', getDefaultCleaningOptions())

    expect(result.cleanedText).toBe('"Hello"-& world')
    expect(result.changed).toBe(true)
    expect(result.sharedSummary.entitiesDecoded).toBe(2)
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

  it('keeps writing mode conservative by default and does not strip literal HTML tags', () => {
    const input = '<p>Hello team</p>'
    const result = cleanText(input, 'plain', getDefaultCleaningOptions('plain'))

    expect(result.cleanedText).toBe(input)
    expect(result.changed).toBe(false)
    expect(result.modeSummary.stats).toContainEqual({ label: 'HTML tags removed', value: 0 })
  })

  it('strips pasted HTML tags in writing mode when the aggressive html toggle is enabled', () => {
    const input =
      '<div><p>Hello <strong>team</strong></p><br />Visit <a href="https://example.com/docs?utm_source=news">docs</a></div>'
    const result = cleanText(input, 'plain', {
      ...getDefaultCleaningOptions('plain'),
      stripHtmlTags: true,
    })

    expect(result.cleanedText).toBe('Hello team\n\nVisit docs')
    expect(result.changed).toBe(true)
    expect(result.modeSummary.stats).toContainEqual({ label: 'HTML tags removed', value: 9 })
  })

  it('repairs wrapped urls in writing mode before cleaning tracking params', () => {
    const input = 'Visit https://example.com/docs/\nlaunch?utm_source=newsletter&keep=1'
    const result = cleanText(input, 'plain', {
      ...getDefaultCleaningOptions('plain'),
      repairWrappedUrls: true,
    })

    expect(result.cleanedText).toBe('Visit https://example.com/docs/launch?keep=1')
    expect(result.changed).toBe(true)
    expect(result.urlSummary.wrappedUrlsRepaired).toBe(1)
    expect(result.urlSummary.trackingParamsRemoved).toBe(1)
  })

  it('keeps already-clean writing unchanged even when aggressive writing helpers are available', () => {
    const input = 'Clean copy lives at https://example.com/docs?keep=1'
    const result = cleanText(input, 'plain', {
      ...getDefaultCleaningOptions('plain'),
      stripHtmlTags: true,
      repairWrappedUrls: true,
    })

    expect(result.cleanedText).toBe(input)
    expect(result.changed).toBe(false)
    expect(result.urlSummary.wrappedUrlsRepaired).toBe(0)
    expect(result.urlSummary.urlsChanged).toBe(0)
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

  it('applies the ai source preset before mode cleanup', () => {
    const input = [
      'Sure, here is the cleaned-up version:',
      '',
      '```markdown',
      '## Heading',
      '',
      '- First point',
      '```',
      '',
      'Let me know if you want a shorter version.',
    ].join('\n')
    const result = cleanText(input, 'plain', {
      ...getDefaultCleaningOptions('plain'),
      sourcePreset: 'ai',
    })

    expect(result.cleanedText).toBe('Heading\n\nFirst point')
    expect(result.sourcePreset).toBe('ai')
    expect(result.sourceSummary.changesApplied).toBeGreaterThan(0)
  })

  it('applies the pdf source preset to repair hard wraps and hyphenated breaks', () => {
    const input = [
      'This para-',
      'graph was copied from a PDF and',
      'split across narrow columns.',
      '',
      'Next section stays separate.',
    ].join('\n')
    const result = cleanText(input, 'plain', {
      ...getDefaultCleaningOptions('plain'),
      sourcePreset: 'pdf',
    })

    expect(result.cleanedText).toBe('This paragraph was copied from a PDF and split across narrow columns.\n\nNext section stays separate.')
    expect(result.sourceSummary.stats).toContainEqual({ label: 'Hyphenated breaks repaired', value: 1 })
  })

  it('applies the gmail source preset even outside email mode', () => {
    const input = [
      'Hi team,',
      '',
      'Latest update is attached.',
      '',
      'On Tue, Apr 1, 2026 at 9:14 AM Morgan wrote:',
      '> Previous thread',
      '',
      'Sent from my iPhone',
    ].join('\n')

    const result = cleanText(input, 'plain', {
      ...getDefaultCleaningOptions('plain'),
      sourcePreset: 'gmail',
    })

    expect(result.cleanedText).toBe('Hi team,\n\nLatest update is attached.')
    expect(result.sourceSummary.changesApplied).toBeGreaterThan(0)
  })

  it('lets do-not-clean regions bypass shared cleanup while still allowing custom rules', () => {
    const input = 'Before [[pc:skip]]<p>Keep me</p> foo[[/pc]] after'
    const result = cleanText(input, 'plain', {
      ...getDefaultCleaningOptions('plain'),
      stripHtmlTags: true,
      customRules: [{ find: 'foo', replace: 'bar', enabled: true }],
    })

    expect(result.cleanedText).toBe('Before <p>Keep me</p> bar after')
    expect(result.protectedSummary.skipRegions).toBe(1)
  })

  it('lets exact regions bypass both cleanup and custom rules', () => {
    const input = 'Before [[pc:exact]]<p>Keep me</p> foo[[/pc]] after'
    const result = cleanText(input, 'plain', {
      ...getDefaultCleaningOptions('plain'),
      stripHtmlTags: true,
      customRules: [{ find: 'foo', replace: 'bar', enabled: true }],
    })

    expect(result.cleanedText).toBe('Before <p>Keep me</p> foo after')
    expect(result.protectedSummary.exactRegions).toBe(1)
  })

  it('lets preserve-links regions keep urls exact while surrounding words are still cleaned', () => {
    const input = 'Use [[pc:links]]“docs” at https://example.com/A%20B?utm_source=test&keep=1[[/pc]] soon.'
    const result = cleanText(input, 'plain', getDefaultCleaningOptions('plain'))

    expect(result.cleanedText).toBe('Use "docs" at https://example.com/A%20B?utm_source=test&keep=1 soon.')
    expect(result.protectedSummary.linkRegions).toBe(1)
  })

  it('lets preserve-code regions use code cleanup inside writing mode', () => {
    const input = 'Intro\n[[pc:code]]1 | const docs = "https://example.com/A%20B?utm_source=test&keep=1";[[/pc]]\nOutro'
    const result = cleanText(input, 'plain', getDefaultCleaningOptions('plain'))

    expect(result.cleanedText).toBe('Intro\nconst docs = "https://example.com/A%20B?utm_source=test&keep=1";\nOutro')
    expect(result.protectedSummary.codeRegions).toBe(1)
  })

  it('supports structured protected-region ranges without adding markers to the raw input', () => {
    const input = 'Before <p>Keep me</p> foo after'
    const result = cleanText(input, 'plain', {
      ...getDefaultCleaningOptions('plain'),
      stripHtmlTags: true,
      protectedRegions: [{ type: 'skip', start: 7, end: 25 }],
      customRules: [{ find: 'foo', replace: 'bar', enabled: true }],
    })

    expect(result.cleanedText).toBe('Before <p>Keep me</p> bar after')
    expect(result.protectedSummary.skipRegions).toBe(1)
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

  it('keeps quoted reply chains when email cleanup is explicitly disabled', () => {
    const input = [
      'Quick update before I head out.',
      '',
      'On Tue, Apr 1, 2026, at 9:14 AM, Morgan Lee <morgan@example.com> wrote:',
      '> Previous thread',
    ].join('\n')

    const result = cleanText(input, 'email', {
      ...getDefaultCleaningOptions('email'),
      removeQuotedEmailChain: false,
    })

    expect(result.cleanedText).toContain('On Tue, Apr 1, 2026, at 9:14 AM, Morgan Lee <morgan@example.com> wrote:')
    expect(result.cleanedText).toContain('> Previous thread')
    expect(result.modeSummary.stats).toContainEqual({ label: 'Reply format detected', value: 'Disabled' })
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
