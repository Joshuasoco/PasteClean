import {
  applyFormatMode,
  getModeDefinition,
  getModeDefaultCleaningOptions,
  runModeStage,
  syncModeControlledOptions,
} from './modes'
import { applyCustomRules, applySharedCleanup, countLines } from './sharedTransforms'
import { cleanUrlsInText } from './urlCleaner'

export const CLEANING_RULES = [
  {
    key: 'removeEmoji',
    label: 'Remove emoji',
    description: 'Strip emoji characters from the cleaned output.',
  },
  {
    key: 'removeAiEmDash',
    label: 'Remove AI em dash',
    description: 'Remove em dashes (—) commonly found in AI-generated writing.',
  },
  {
    key: 'cleanWhitespace',
    label: 'Whitespace cleanup',
    description: 'Trim trailing spaces and collapse duplicate blank lines where the mode allows it.',
  },
  {
    key: 'stripInvisibleChars',
    label: 'Invisible Unicode',
    description: 'Remove zero-width spaces, soft hyphens, and BOM characters.',
  },
  {
    key: 'decodeHtmlEntities',
    label: 'HTML entities',
    description: 'Decode items like &amp; and &nbsp; before further cleanup.',
  },
  {
    key: 'normalizePunctuation',
    label: 'Smart punctuation',
    description: 'Convert curly quotes and long dashes into plain ASCII punctuation.',
  },
  {
    key: 'stripTrackingParams',
    label: 'Tracking params',
    description: 'Remove utm_* values and common click identifiers from links.',
  },
  {
    key: 'unwrapRedirects',
    label: 'Redirect unwrapping',
    description: 'Recover the real destination from wrapper links.',
  },
  {
    key: 'decodeReadableUrls',
    label: 'Readable URLs',
    description: 'Decode percent-encoded URLs into something easier to read and copy.',
  },
]

const DEFAULT_CLEANING_OPTIONS = {
  stripInvisibleChars: true,
  removeEmoji: false,
  removeAiEmDash: false,
  cleanWhitespace: true,
}

export function getDefaultCleaningOptions(mode = 'plain') {
  return resolveCleaningOptions(mode)
}

export function syncCleaningOptionsForModeChange(currentOptions, currentMode, nextMode) {
  return syncModeControlledOptions(currentOptions, currentMode, nextMode)
}

function resolveCleaningOptions(mode, options) {
  const resolvedOptions = {
    ...DEFAULT_CLEANING_OPTIONS,
    ...getModeDefaultCleaningOptions(mode),
    ...options,
  }

  if (mode === 'plain' && resolvedOptions.aggressiveWriting) {
    return {
      ...resolvedOptions,
      stripHtmlTags: true,
      repairWrappedUrls: true,
    }
  }

  return resolvedOptions
}

export function cleanText(value, mode = 'plain', options = getDefaultCleaningOptions(mode)) {
  const original = value ?? ''
  const customRules = Array.isArray(options?.customRules) ? options.customRules : []
  const { customRules: ignoredCustomRules, ...optionValues } = options ?? {}
  const cleaningOptions = resolveCleaningOptions(mode, optionValues)
  const modeDefinition = getModeDefinition(mode)
  const preprocessed = runModeStage(modeDefinition.id, 'preprocess', original, cleaningOptions)
  const sharedCleanupResult = applySharedCleanup(preprocessed.text, cleaningOptions)
  const modeResult = applyFormatMode(sharedCleanupResult.text, modeDefinition.id, cleaningOptions)
  const urlResult = cleanUrlsInText(modeResult.text, cleaningOptions)
  const postprocessed = runModeStage(modeDefinition.id, 'postprocess', urlResult.text, cleaningOptions)
  const customRuleResult = applyCustomRules(postprocessed.text, customRules)
  const cleanedText = customRuleResult.text

  return {
    cleanedText,
    changed: cleanedText !== original,
    removedCharacters: Math.max(original.length - cleanedText.length, 0),
    lineCountBefore: countLines(original),
    lineCountAfter: countLines(cleanedText),
    urlChanges: urlResult.urlChanges,
    urlSummary: urlResult.summary,
    mode: modeDefinition.id,
    modeLabel: modeDefinition.label,
    modeDescription: modeDefinition.description,
    modeRules: modeDefinition.rules,
    sharedSummary: sharedCleanupResult.summary,
    modeSummary: modeResult.summary,
    enabledRules: cleaningOptions,
    customRuleSummary: customRuleResult.summary,
  }
}
