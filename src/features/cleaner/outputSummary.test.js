import { describe, expect, it } from 'vitest'
import { buildOutputChangeSummary } from './outputSummary'

function createBaseResult(overrides = {}) {
  return {
    changed: true,
    mode: 'plain',
    modeLabel: 'Writing',
    sourcePreset: 'none',
    sourcePresetLabel: 'No source',
    sourcePresetSuggestedMode: null,
    destinationPreset: 'none',
    destinationPresetLabel: 'No destination',
    enabledRules: {
      cleanWhitespace: true,
      decodeHtmlEntities: true,
      normalizePunctuation: true,
      stripInvisibleChars: true,
      stripTrackingParams: true,
      unwrapRedirects: true,
      decodeReadableUrls: true,
    },
    sourceSummary: { stats: [], changesApplied: 0 },
    sharedSummary: {
      entitiesDecoded: 0,
      aiEmDashesRemoved: 0,
      punctuationNormalized: 0,
      emojiRemoved: 0,
      invisibleCharsRemoved: 0,
    },
    modeSummary: { stats: [] },
    urlSummary: {
      urlsChanged: 0,
      wrappedUrlsRepaired: 0,
      trackingParamsRemoved: 0,
      redirectsUnwrapped: 0,
      urlsDecoded: 0,
    },
    customRuleSummary: { activeRules: 0, replacementsMade: 0 },
    destinationSummary: { stats: [], changesApplied: 0 },
    ...overrides,
  }
}

describe('buildOutputChangeSummary', () => {
  it('lists rules that ran for global and selected mode scopes', () => {
    const result = createBaseResult({
      mode: 'code',
      modeLabel: 'Code',
      enabledRules: {
        cleanWhitespace: true,
        decodeHtmlEntities: false,
        normalizePunctuation: false,
        stripInvisibleChars: false,
        stripTrackingParams: false,
        unwrapRedirects: false,
        decodeReadableUrls: false,
        preserveCodeTokens: true,
      },
      customRuleSummary: { activeRules: 2, replacementsMade: 3 },
    })

    const summary = buildOutputChangeSummary(result, { changed: true, removedCount: 1, addedCount: 1 })

    expect(summary.rulesRun.global).toContain('Custom find/replace (2 active)')
    expect(summary.rulesRun.mode).toContain('Code mode cleanup')
    expect(summary.rulesRun.mode).toContain('Preserve code tokens and string literals')
  })

  it('separates global cleanup changes from mode-specific changes', () => {
    const result = createBaseResult({
      sharedSummary: {
        entitiesDecoded: 2,
        aiEmDashesRemoved: 0,
        punctuationNormalized: 1,
        emojiRemoved: 0,
        invisibleCharsRemoved: 3,
      },
      urlSummary: {
        urlsChanged: 1,
        wrappedUrlsRepaired: 0,
        trackingParamsRemoved: 2,
        redirectsUnwrapped: 1,
        urlsDecoded: 1,
      },
      modeSummary: {
        stats: [
          { label: 'Formatting markers removed', value: 4 },
          { label: 'Paragraphs kept readable', value: 2 },
        ],
      },
    })

    const summary = buildOutputChangeSummary(result, { changed: true, removedCount: 8, addedCount: 3 })

    expect(summary.globalItems).toContain('Entities decoded (2)')
    expect(summary.globalItems).toContain('Tracking params removed (2)')
    expect(summary.modeItems).toContain('Formatting markers removed (4)')
    expect(summary.modeItems).toContain('Paragraphs kept readable (2)')
  })

  it('emits semantic warnings when potentially meaningful content is altered', () => {
    const result = createBaseResult({
      mode: 'email',
      modeLabel: 'Email',
      sharedSummary: {
        entitiesDecoded: 1,
        aiEmDashesRemoved: 0,
        punctuationNormalized: 2,
        emojiRemoved: 0,
        invisibleCharsRemoved: 0,
      },
      urlSummary: {
        urlsChanged: 1,
        wrappedUrlsRepaired: 0,
        trackingParamsRemoved: 1,
        redirectsUnwrapped: 0,
        urlsDecoded: 0,
      },
      modeSummary: {
        stats: [
          { label: 'Quoted lines removed', value: 2 },
          { label: 'Header lines removed', value: 0 },
          { label: 'Reply chain removed', value: 'Yes' },
        ],
      },
    })

    const summary = buildOutputChangeSummary(result, { changed: true, removedCount: 6, addedCount: 2 })

    expect(summary.semanticWarnings.length).toBeGreaterThan(0)
    expect(summary.semanticWarnings.some((warning) => warning.includes('URLs were rewritten'))).toBe(true)
    expect(summary.semanticWarnings.some((warning) => warning.includes('reply-chain cleanup'))).toBe(true)
  })

  it('keeps summary visible even when no diff changes were detected', () => {
    const result = createBaseResult({ changed: false })
    const summary = buildOutputChangeSummary(result, { changed: false, removedCount: 0, addedCount: 0 })

    expect(summary.visible).toBe(true)
    expect(summary.changed).toBe(false)
    expect(summary.headline).toBe('No changes needed for current rules.')
  })
})
