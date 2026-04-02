import { applyFormatMode, getModeDefinition } from './modes'
import { cleanUrlsInText } from './urlCleaner'

const INVISIBLE_CHARACTERS = /[\u00AD\u200B-\u200D\u2060\uFEFF]/g

export const CLEANING_RULES = [
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
    key: 'cleanWhitespace',
    label: 'Whitespace cleanup',
    description: 'Trim trailing spaces and collapse duplicate blank lines where the mode allows it.',
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
  decodeHtmlEntities: true,
  normalizePunctuation: true,
  cleanWhitespace: true,
  stripTrackingParams: true,
  unwrapRedirects: true,
  decodeReadableUrls: true,
}

const SMART_PUNCTUATION_MAP = new Map([
  ['\u2018', "'"],
  ['\u2019', "'"],
  ['\u201A', "'"],
  ['\u201B', "'"],
  ['\u2032', "'"],
  ['\u2035', "'"],
  ['\u201C', '"'],
  ['\u201D', '"'],
  ['\u201E', '"'],
  ['\u201F', '"'],
  ['\u2033', '"'],
  ['\u2036', '"'],
  ['\u2013', '-'],
  ['\u2014', '-'],
  ['\u2015', '-'],
  ['\u2212', '-'],
])

function decodeHtmlEntities(value) {
  if (!value || !value.includes('&')) {
    return value
  }

  const textarea = document.createElement('textarea')
  let decoded = value

  for (let index = 0; index < 3; index += 1) {
    textarea.innerHTML = decoded

    const nextValue = textarea.value.replace(/\u00A0/g, ' ')

    if (nextValue === decoded) {
      break
    }

    decoded = nextValue
  }

  return decoded
}

function normalizeSmartPunctuation(value) {
  return Array.from(value, (character) => SMART_PUNCTUATION_MAP.get(character) ?? character).join('')
}

function countLines(value) {
  if (!value) {
    return 0
  }

  return value.split('\n').length
}

export function getDefaultCleaningOptions() {
  return { ...DEFAULT_CLEANING_OPTIONS }
}

function resolveCleaningOptions(options) {
  return { ...DEFAULT_CLEANING_OPTIONS, ...options }
}

function countOccurrences(value, search) {
  if (!search) {
    return 0
  }

  return value.split(search).length - 1
}

function applyCustomRules(value, customRules = []) {
  let nextValue = value
  let replacementsMade = 0
  let activeRules = 0

  for (const rule of customRules) {
    if (!rule?.enabled || !rule.find) {
      continue
    }

    activeRules += 1
    const occurrences = countOccurrences(nextValue, rule.find)

    if (occurrences === 0) {
      continue
    }

    replacementsMade += occurrences
    nextValue = nextValue.split(rule.find).join(rule.replace ?? '')
  }

  return {
    text: nextValue,
    summary: {
      activeRules,
      replacementsMade,
    },
  }
}

function createBaseText(value, options) {
  let text = (value ?? '').replace(/\r\n?/g, '\n')

  if (options.decodeHtmlEntities) {
    text = decodeHtmlEntities(text)
  }

  if (options.normalizePunctuation) {
    text = normalizeSmartPunctuation(text)
  }

  if (options.stripInvisibleChars) {
    text = text.replace(INVISIBLE_CHARACTERS, '')
  }

  return text
}

export function cleanText(value, mode = 'plain', options = DEFAULT_CLEANING_OPTIONS) {
  const original = value ?? ''
  const customRules = Array.isArray(options?.customRules) ? options.customRules : []
  const { customRules: ignoredCustomRules, ...optionValues } = options ?? {}
  const cleaningOptions = resolveCleaningOptions(optionValues)
  const baseText = createBaseText(original, cleaningOptions)
  const modeDefinition = getModeDefinition(mode)
  const modeResult = applyFormatMode(baseText, modeDefinition.id, cleaningOptions)
  const urlResult = cleanUrlsInText(modeResult.text, cleaningOptions)
  const customRuleResult = applyCustomRules(urlResult.text, customRules)
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
    modeSummary: modeResult.summary,
    enabledRules: cleaningOptions,
    customRuleSummary: customRuleResult.summary,
  }
}
