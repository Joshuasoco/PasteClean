import { cleanUrlsInText } from './urlCleaner'

const INVISIBLE_CHARACTERS = /[\u00AD\u200B-\u200D\u2060\uFEFF]/g
const TRAILING_WHITESPACE = /[^\S\n]+$/gm
const EXCESS_BLANK_LINES = /\n[ \t]*\n(?:[ \t]*\n)+/g

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

export function cleanText(value) {
  const original = value ?? ''
  const normalizedText = normalizeSmartPunctuation(
    decodeHtmlEntities(original)
      .replace(/\r\n?/g, '\n')
      .replace(INVISIBLE_CHARACTERS, '')
      .replace(TRAILING_WHITESPACE, '')
      .replace(EXCESS_BLANK_LINES, '\n\n')
      .replace(/^\n+|\n+$/g, '')
  )

  const urlResult = cleanUrlsInText(normalizedText)
  const cleanedText = urlResult.text

  return {
    cleanedText,
    changed: cleanedText !== original,
    removedCharacters: Math.max(original.length - cleanedText.length, 0),
    lineCountBefore: countLines(original),
    lineCountAfter: countLines(cleanedText),
    urlChanges: urlResult.urlChanges,
    urlSummary: urlResult.summary,
  }
}
