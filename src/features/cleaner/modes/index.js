import { codeMode } from './code'
import { emailMode } from './email'
import { markdownMode } from './markdown'
import { plainMode } from './plain'
import { normalizeStageResult } from './strategy'

const MODE_DEFINITIONS = [plainMode, markdownMode, codeMode, emailMode]
const BASE_MODE_DEFAULT_CLEANING_OPTIONS = {
  stripInvisibleChars: true,
  decodeHtmlEntities: true,
  normalizePunctuation: true,
  stripTrackingParams: true,
  unwrapRedirects: true,
  decodeReadableUrls: true,
  preserveCodeTokens: false,
}

function buildModeDefaultCleaningOptions(mode) {
  return {
    ...BASE_MODE_DEFAULT_CLEANING_OPTIONS,
    decodeHtmlEntities: mode.shouldDecodeHtmlEntities,
    normalizePunctuation: mode.shouldNormalizePunctuation,
    stripTrackingParams: mode.shouldCleanUrls,
    unwrapRedirects: mode.shouldCleanUrls,
    decodeReadableUrls: mode.shouldCleanUrls,
    ...(mode.defaultCleaningOptions ?? {}),
  }
}

const MODE_CONTROLLED_RULE_KEYS = [
  ...new Set(MODE_DEFINITIONS.flatMap((mode) => Object.keys(buildModeDefaultCleaningOptions(mode)))),
]

const MODE_MAP = new Map(MODE_DEFINITIONS.map((mode) => [mode.id, mode]))

export function getModes() {
  return MODE_DEFINITIONS
}

export function getModeDefinition(modeId) {
  return MODE_MAP.get(modeId) ?? MODE_MAP.get('plain')
}

export function getModeDefaultCleaningOptions(modeId) {
  return buildModeDefaultCleaningOptions(getModeDefinition(modeId))
}

export function syncModeControlledOptions(currentOptions, currentModeId, nextModeId) {
  const currentDefaults = getModeDefaultCleaningOptions(currentModeId)
  const nextDefaults = getModeDefaultCleaningOptions(nextModeId)
  const nextOptions = { ...currentOptions }

  for (const key of MODE_CONTROLLED_RULE_KEYS) {
    if (currentOptions[key] === currentDefaults[key]) {
      nextOptions[key] = nextDefaults[key]
    }
  }

  return nextOptions
}

export function runModeStage(modeId, stageName, text, options) {
  const mode = getModeDefinition(modeId)
  const stage = mode[stageName]
  return normalizeStageResult(stage?.(text, options), text)
}

export function applyFormatMode(text, modeId, options) {
  return runModeStage(modeId, 'transform', text, options)
}
