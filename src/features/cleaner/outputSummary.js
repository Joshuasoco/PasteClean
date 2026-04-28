import { getModeDisplayLabel } from './modes'

const DEFAULT_NO_CHANGE_HEADLINE = 'No changes needed for current rules.'
const DEFAULT_CHANGE_HEADLINE = 'Changes made'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function hasTruthyValue(value) {
  if (typeof value === 'number') {
    return value > 0
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()

    if (!normalized) {
      return false
    }

    return !['no', 'none', 'off', 'disabled', '0'].includes(normalized)
  }

  return Boolean(value)
}

function formatStatItem(label, value) {
  if (typeof value === 'number') {
    return `${label} (${value})`
  }

  return `${label}: ${value}`
}

function listPositiveStats(summary) {
  return asArray(summary?.stats)
    .filter((entry) => entry && hasTruthyValue(entry.value))
    .map((entry) => formatStatItem(entry.label, entry.value))
}

function hasModeOptionEnabled(cleaningResult, key) {
  return Boolean(cleaningResult?.enabledRules?.[key])
}

function buildRulesRunSummary(cleaningResult) {
  if (!cleaningResult) {
    return { global: [], mode: [] }
  }

  const global = []
  const mode = []

  if (cleaningResult.sourcePreset && cleaningResult.sourcePreset !== 'none') {
    global.push(`Source preset: ${cleaningResult.sourcePresetLabel}`)
  }

  if (hasModeOptionEnabled(cleaningResult, 'decodeHtmlEntities')) {
    global.push('Decode HTML entities')
  }

  if (hasModeOptionEnabled(cleaningResult, 'normalizePunctuation')) {
    global.push('Normalize smart punctuation')
  }

  if (hasModeOptionEnabled(cleaningResult, 'stripInvisibleChars')) {
    global.push('Strip invisible Unicode')
  }

  if (hasModeOptionEnabled(cleaningResult, 'removeEmoji')) {
    global.push('Remove emoji')
  }

  if (hasModeOptionEnabled(cleaningResult, 'removeAiEmDash')) {
    global.push('Remove AI em dashes')
  }

  if (hasModeOptionEnabled(cleaningResult, 'repairWrappedUrls')) {
    global.push('Repair wrapped URLs')
  }

  if (hasModeOptionEnabled(cleaningResult, 'stripTrackingParams')) {
    global.push('Strip tracking parameters')
  }

  if (hasModeOptionEnabled(cleaningResult, 'unwrapRedirects')) {
    global.push('Unwrap redirect links')
  }

  if (hasModeOptionEnabled(cleaningResult, 'decodeReadableUrls')) {
    global.push('Decode readable URLs')
  }

  if ((cleaningResult.customRuleSummary?.activeRules ?? 0) > 0) {
    global.push(`Custom find/replace (${cleaningResult.customRuleSummary.activeRules} active)`)
  }

  if (cleaningResult.destinationPreset && cleaningResult.destinationPreset !== 'none') {
    global.push(`Destination preset: ${cleaningResult.destinationPresetLabel}`)
  }

  mode.push(`${cleaningResult.modeLabel} mode cleanup`)
  mode.push(...asArray(cleaningResult.modeRules).map((rule) => `Mode rule: ${rule}`))

  if (cleaningResult.mode === 'plain' && hasModeOptionEnabled(cleaningResult, 'stripHtmlTags')) {
    mode.push('Strip pasted HTML tags')
  }

  if (cleaningResult.mode === 'markdown') {
    mode.push(
      hasModeOptionEnabled(cleaningResult, 'preserveMarkdownCode')
        ? 'Protect Markdown code spans and fences'
        : 'Clean Markdown code spans and fences as prose'
    )
  }

  if (cleaningResult.mode === 'code') {
    mode.push(
      hasModeOptionEnabled(cleaningResult, 'preserveCodeTokens')
        ? 'Preserve code tokens and string literals'
        : 'Code token protection disabled'
    )
  }

  if (cleaningResult.mode === 'email' && hasModeOptionEnabled(cleaningResult, 'removeQuotedEmailChain')) {
    mode.push('Remove quoted email chains')
  }

  if (hasModeOptionEnabled(cleaningResult, 'cleanWhitespace')) {
    mode.push('Whitespace cleanup in mode transform')
  }

  return { global, mode }
}

function buildGlobalChangeItems(cleaningResult) {
  if (!cleaningResult) {
    return []
  }

  const sharedItems = [
    { label: 'Entities decoded', value: cleaningResult.sharedSummary?.entitiesDecoded ?? 0 },
    { label: 'AI em dashes removed', value: cleaningResult.sharedSummary?.aiEmDashesRemoved ?? 0 },
    { label: 'Quotes normalized', value: cleaningResult.sharedSummary?.punctuationNormalized ?? 0 },
    { label: 'Emoji removed', value: cleaningResult.sharedSummary?.emojiRemoved ?? 0 },
    { label: 'Invisible characters removed', value: cleaningResult.sharedSummary?.invisibleCharsRemoved ?? 0 },
  ]
    .filter((entry) => entry.value > 0)
    .map((entry) => formatStatItem(entry.label, entry.value))

  const urlItems = [
    { label: 'Wrapped URLs repaired', value: cleaningResult.urlSummary?.wrappedUrlsRepaired ?? 0 },
    { label: 'URLs cleaned', value: cleaningResult.urlSummary?.urlsChanged ?? 0 },
    { label: 'Tracking params removed', value: cleaningResult.urlSummary?.trackingParamsRemoved ?? 0 },
    { label: 'Redirect wrappers removed', value: cleaningResult.urlSummary?.redirectsUnwrapped ?? 0 },
    { label: 'URLs decoded for readability', value: cleaningResult.urlSummary?.urlsDecoded ?? 0 },
  ]
    .filter((entry) => entry.value > 0)
    .map((entry) => formatStatItem(entry.label, entry.value))

  const sourceItems = listPositiveStats(cleaningResult.sourceSummary)
  const destinationItems = listPositiveStats(cleaningResult.destinationSummary)
  const customItems =
    (cleaningResult.customRuleSummary?.replacementsMade ?? 0) > 0
      ? [formatStatItem('Custom replacements applied', cleaningResult.customRuleSummary.replacementsMade)]
      : []

  return [...sourceItems, ...sharedItems, ...urlItems, ...customItems, ...destinationItems]
}

function buildModeSpecificChangeItems(cleaningResult) {
  if (!cleaningResult) {
    return []
  }

  return listPositiveStats(cleaningResult.modeSummary)
}

function buildSemanticWarnings(cleaningResult) {
  if (!cleaningResult?.changed) {
    return []
  }

  const warnings = []
  const modeStats = asArray(cleaningResult.modeSummary?.stats)
  const htmlTagsRemoved = modeStats.find((entry) => entry?.label === 'HTML tags removed')
  const quotedLinesRemoved = modeStats.find((entry) => entry?.label === 'Quoted lines removed')
  const headerLinesRemoved = modeStats.find((entry) => entry?.label === 'Header lines removed')
  const replyChainRemoved = modeStats.find((entry) => entry?.label === 'Reply chain removed')

  if ((cleaningResult.sharedSummary?.punctuationNormalized ?? 0) > 0) {
    warnings.push('Smart punctuation normalized visible characters; quotes or dashes may now differ from the source.')
  }

  if ((cleaningResult.sharedSummary?.entitiesDecoded ?? 0) > 0) {
    warnings.push('HTML entities were decoded into literal characters, which can change original text intent.')
  }

  if ((cleaningResult.urlSummary?.urlsChanged ?? 0) > 0) {
    warnings.push('One or more URLs were rewritten by cleanup rules. Verify link targets before publishing.')
  }

  if ((cleaningResult.customRuleSummary?.replacementsMade ?? 0) > 0) {
    warnings.push('Custom find/replace rules rewrote text content. Confirm replacements are context-safe.')
  }

  if (
    cleaningResult.mode === 'email' &&
    (replyChainRemoved?.value === 'Yes' || (quotedLinesRemoved?.value ?? 0) > 0 || (headerLinesRemoved?.value ?? 0) > 0)
  ) {
    warnings.push('Email reply-chain cleanup removed prior-thread content. Confirm no needed context was dropped.')
  }

  if ((htmlTagsRemoved?.value ?? 0) > 0) {
    warnings.push('HTML tags were removed; visual structure or embedded annotations may have changed.')
  }

  if (cleaningResult.mode === 'code' && cleaningResult.enabledRules?.preserveCodeTokens === false) {
    warnings.push('Code token protection is off, so executable snippets may have been rewritten.')
  }

  if (cleaningResult.mode === 'markdown' && cleaningResult.enabledRules?.preserveMarkdownCode === false) {
    warnings.push('Markdown code protection is off, so fenced or inline code may have been altered.')
  }

  if (
    (cleaningResult.destinationSummary?.stats ?? []).some(
      (entry) => entry.label === 'Wrapped prose lines joined' && entry.value > 0
    )
  ) {
    warnings.push('Wrapped prose lines were joined by the destination preset; sentence boundaries may have shifted.')
  }

  return warnings
}

export function buildOutputChangeSummary(cleaningResult, diffStats = {}) {
  const rulesRun = buildRulesRunSummary(cleaningResult)
  const globalItems = buildGlobalChangeItems(cleaningResult)
  const modeItems = buildModeSpecificChangeItems(cleaningResult)
  const semanticWarnings = buildSemanticWarnings(cleaningResult)
  const changed = Boolean(cleaningResult && diffStats.changed)
  const destinationNote =
    cleaningResult?.destinationPreset && cleaningResult.destinationPreset !== 'none'
      ? `${cleaningResult.destinationPresetLabel} destination active.`
      : ''
  const suggestedModeLabel =
    cleaningResult?.sourcePresetSuggestedMode && cleaningResult.sourcePresetSuggestedMode !== cleaningResult.mode
      ? getModeDisplayLabel(cleaningResult.sourcePresetSuggestedMode)
      : null

  const note =
    cleaningResult?.sourcePreset && cleaningResult.sourcePreset !== 'none'
      ? `${cleaningResult?.sourcePresetLabel} preset active${
          suggestedModeLabel
            ? `. Best paired with ${suggestedModeLabel} mode.`
            : '.'
        }${destinationNote ? ` ${destinationNote}` : ''}`
      : destinationNote

  return {
    changed,
    visible: Boolean(cleaningResult),
    headline: changed ? DEFAULT_CHANGE_HEADLINE : DEFAULT_NO_CHANGE_HEADLINE,
    detail: changed ? `${diffStats.removedCount ?? 0} removals, ${diffStats.addedCount ?? 0} additions` : '',
    rulesRun,
    globalItems,
    modeItems,
    semanticWarnings,
    note,
  }
}
