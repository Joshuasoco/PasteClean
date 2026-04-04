const INVISIBLE_CHARACTERS = /[\u00AD\u200B-\u200D\u2060\uFEFF]/g
const AI_EM_DASHES = /\u2014/g
const HTML_ENTITY_PATTERN = /&(?:#\d+|#x[\da-f]+|[a-z][a-z0-9]+);/gi
const EMOJI_PATTERN =
  /(?:\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*|[#*0-9]\uFE0F?\u20E3)/gu

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

function countMatches(value, pattern) {
  return value.match(pattern)?.length ?? 0
}

function normalizeSmartPunctuation(value) {
  let replacements = 0

  const text = Array.from(value, (character) => {
    const normalizedCharacter = SMART_PUNCTUATION_MAP.get(character)

    if (normalizedCharacter) {
      replacements += 1
    }

    return normalizedCharacter ?? character
  }).join('')

  return {
    text,
    replacements,
  }
}

function countOccurrences(value, search) {
  if (!search) {
    return 0
  }

  return value.split(search).length - 1
}

export function countLines(value) {
  if (!value) {
    return 0
  }

  return value.split('\n').length
}

export function applySharedCleanup(value, options = {}) {
  let text = (value ?? '').replace(/\r\n?/g, '\n')
  const summary = {
    entitiesDecoded: 0,
    aiEmDashesRemoved: 0,
    punctuationNormalized: 0,
    emojiRemoved: 0,
    invisibleCharsRemoved: 0,
  }

  if (options.decodeHtmlEntities) {
    const decodedText = decodeHtmlEntities(text)

    if (decodedText !== text) {
      summary.entitiesDecoded = countMatches(text, HTML_ENTITY_PATTERN)
      text = decodedText
    }
  }

  if (options.removeAiEmDash) {
    summary.aiEmDashesRemoved = countMatches(text, AI_EM_DASHES)
    text = text.replace(AI_EM_DASHES, '')
  }

  if (options.normalizePunctuation) {
    const normalized = normalizeSmartPunctuation(text)
    summary.punctuationNormalized = normalized.replacements
    text = normalized.text
  }

  if (options.removeEmoji) {
    summary.emojiRemoved = countMatches(text, EMOJI_PATTERN)
    text = text.replace(EMOJI_PATTERN, '')
  }

  if (options.stripInvisibleChars) {
    summary.invisibleCharsRemoved = countMatches(text, INVISIBLE_CHARACTERS)
    text = text.replace(INVISIBLE_CHARACTERS, '')
  }

  return {
    text,
    summary,
  }
}

export function applyCustomRules(value, customRules = []) {
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
