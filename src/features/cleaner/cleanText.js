import { applyFormatMode, getModeDefinition } from './modes'
import { cleanUrlsInText } from './urlCleaner'

const INVISIBLE_CHARACTERS = /[\u00AD\u200B-\u200D\u2060\uFEFF]/g

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

function createBaseText(value) {
  return normalizeSmartPunctuation(decodeHtmlEntities(value ?? '').replace(/\r\n?/g, '\n').replace(INVISIBLE_CHARACTERS, ''))
}

export function cleanText(value, mode = 'plain') {
  const original = value ?? ''
  const baseText = createBaseText(original)
  const modeDefinition = getModeDefinition(mode)
  const modeResult = applyFormatMode(baseText, modeDefinition.id)
  const urlResult = cleanUrlsInText(modeResult.text)
  const cleanedText = urlResult.text

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
  }
}
