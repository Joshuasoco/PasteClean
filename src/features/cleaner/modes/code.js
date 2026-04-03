import { passthroughStage } from './strategy'

const TRAILING_WHITESPACE = /[^\S\n]+$/gm
const EXCESS_BLANK_LINES = /\n{4,}/g
const CODE_MODE_STATE = Symbol('codeModeState')
const PLACEHOLDER_PREFIX = '__PASTECLEAN_CODE_LITERAL_'

function removeLineNumberPrefix(line) {
  const patterns = [
    /^(\s*)\d+\s*\|\s?/u,
    /^(\s*)\d+\s*:\s?/u,
    /^(\s*)\d+\)\s?/u,
    /^(\s*)\d+\.\s+/u,
    /^(\s*)\d+\s{2,}/u,
  ]

  for (const pattern of patterns) {
    if (pattern.test(line)) {
      return line.replace(pattern, '$1')
    }
  }

  return line
}

function stripLineNumbers(text) {
  let lineNumbersRemoved = 0

  const strippedText = text
    .split('\n')
    .map((line) => {
      const withoutNumber = removeLineNumberPrefix(line)

      if (withoutNumber !== line) {
        lineNumbersRemoved += 1
      }

      return withoutNumber
    })
    .join('\n')

  return { text: strippedText, lineNumbersRemoved }
}

function isEscaped(value, index) {
  let slashCount = 0

  for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) {
    slashCount += 1
  }

  return slashCount % 2 === 1
}

function findQuotedStringEnd(text, startIndex, quote) {
  for (let cursor = startIndex + 1; cursor < text.length; cursor += 1) {
    const character = text[cursor]

    if ((character === '\n' || character === '\r') && !isEscaped(text, cursor - 1)) {
      return -1
    }

    if (character === quote && !isEscaped(text, cursor)) {
      return cursor + 1
    }
  }

  return -1
}

function findTripleQuoteEnd(text, startIndex, quote) {
  const delimiter = quote.repeat(3)
  const endIndex = text.indexOf(delimiter, startIndex + 3)

  return endIndex === -1 ? -1 : endIndex + 3
}

function findTemplateLiteralEnd(text, startIndex) {
  for (let cursor = startIndex + 1; cursor < text.length; cursor += 1) {
    if (text[cursor] === '`' && !isEscaped(text, cursor)) {
      return cursor + 1
    }
  }

  return -1
}

function getProtectedLiteralRanges(text) {
  const ranges = []

  for (let cursor = 0; cursor < text.length; cursor += 1) {
    let endIndex = -1
    const character = text[cursor]

    if ((character === '"' || character === "'") && text.slice(cursor, cursor + 3) === character.repeat(3)) {
      endIndex = findTripleQuoteEnd(text, cursor, character)
    } else if (character === '"' || character === "'") {
      endIndex = findQuotedStringEnd(text, cursor, character)
    } else if (character === '`') {
      endIndex = findTemplateLiteralEnd(text, cursor)
    }

    if (endIndex === -1) {
      continue
    }

    ranges.push({ start: cursor, end: endIndex })
    cursor = endIndex - 1
  }

  return ranges
}

function buildPlaceholder(index, originalValue) {
  const lineCount = originalValue.split('\n').length

  if (lineCount === 1) {
    return `${PLACEHOLDER_PREFIX}${index}__`
  }

  return Array.from({ length: lineCount }, (_, lineIndex) => `${PLACEHOLDER_PREFIX}${index}_${lineIndex}__`).join('\n')
}

function maskProtectedLiterals(text) {
  const ranges = getProtectedLiteralRanges(text)

  if (ranges.length === 0) {
    return { text, placeholders: [] }
  }

  let cursor = 0
  const parts = []
  const placeholders = []

  for (let index = 0; index < ranges.length; index += 1) {
    const range = ranges[index]
    const originalValue = text.slice(range.start, range.end)
    const placeholder = buildPlaceholder(index, originalValue)

    parts.push(text.slice(cursor, range.start))
    parts.push(placeholder)
    placeholders.push({ placeholder, originalValue })
    cursor = range.end
  }

  parts.push(text.slice(cursor))

  return {
    text: parts.join(''),
    placeholders,
  }
}

function restoreProtectedLiterals(text, placeholders) {
  return placeholders.reduce(
    (restoredText, entry) => restoredText.split(entry.placeholder).join(entry.originalValue),
    text
  )
}

function preprocess(text, options = {}) {
  if (!options.preserveCodeTokens) {
    return passthroughStage(text)
  }

  const stripped = stripLineNumbers(text)
  const masked = maskProtectedLiterals(stripped.text)

  options[CODE_MODE_STATE] = {
    lineNumbersRemoved: stripped.lineNumbersRemoved,
    placeholders: masked.placeholders,
  }

  return { text: masked.text }
}

function transform(text, options = {}) {
  const codeSafeState = options[CODE_MODE_STATE]
  const lineNumberResult = codeSafeState ? null : stripLineNumbers(text)
  const lineNumbersRemoved = codeSafeState ? codeSafeState.lineNumbersRemoved : lineNumberResult.lineNumbersRemoved
  const sourceText = codeSafeState ? text : lineNumberResult.text

  let cleaned = sourceText
    .split('\n')
    .map((line) => (options.cleanWhitespace === false ? line : line.replace(TRAILING_WHITESPACE, '')))
    .join('\n')

  if (options.cleanWhitespace !== false) {
    cleaned = cleaned.replace(EXCESS_BLANK_LINES, '\n\n\n').replace(/^\n+|\n+$/g, '')
  }

  return {
    text: cleaned,
    summary: {
      title: 'Code cleanup',
      stats: [
        { label: 'Line numbers removed', value: lineNumbersRemoved },
        { label: 'Indentation preserved', value: 'Yes' },
        { label: 'Code-safe path', value: options.preserveCodeTokens === false ? 'Off' : 'On' },
      ],
      highlights: [
        'Leading line numbers are removed from common copy sources.',
        options.preserveCodeTokens === false
          ? 'Literal content can be rewritten when code-safe preservation is turned off.'
          : 'String and template literal content is restored exactly after cleanup.',
      ],
    },
  }
}

function postprocess(text, options = {}) {
  const codeSafeState = options[CODE_MODE_STATE]

  if (!codeSafeState) {
    return passthroughStage(text)
  }

  delete options[CODE_MODE_STATE]

  return {
    text: restoreProtectedLiterals(text, codeSafeState.placeholders),
  }
}

export const codeMode = {
  id: 'code',
  label: 'Code',
  description: 'Preserves indentation and removes copied line numbers.',
  rules: [
    'Common line-number prefixes are removed.',
    'Indentation is preserved for usable code.',
    'Code-safe token preservation is on by default for string literals.',
  ],
  sample: `1 | function greet(name) {
2 |   const docs = "https://example.com/api%20guide?utm_source=docs";
3 |   console.log("Hello, " + name);
4 | }
`,
  shouldCleanUrls: false,
  shouldNormalizePunctuation: false,
  shouldDecodeHtmlEntities: false,
  defaultCleaningOptions: {
    preserveCodeTokens: true,
    stripInvisibleChars: false,
  },
  preprocess,
  transform,
  postprocess,
}
