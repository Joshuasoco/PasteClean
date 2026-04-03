import { passthroughStage } from './strategy'

const TRAILING_WHITESPACE = /[^\S\n]+$/gm
const EXCESS_BLANK_LINES = /\n{4,}/g

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

function transform(text, options = {}) {
  let lineNumbersRemoved = 0

  let cleaned = text
    .split('\n')
    .map((line) => {
      const withoutNumber = removeLineNumberPrefix(line)

      if (withoutNumber !== line) {
        lineNumbersRemoved += 1
      }

      return options.cleanWhitespace === false
        ? withoutNumber
        : withoutNumber.replace(TRAILING_WHITESPACE, '')
    })
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
      ],
      highlights: [
        'Leading line numbers are removed from common copy sources.',
        'Indentation is left intact so the code stays usable.',
      ],
    },
  }
}

export const codeMode = {
  id: 'code',
  label: 'Code',
  description: 'Preserves indentation and removes copied line numbers.',
  rules: [
    'Common line-number prefixes are removed.',
    'Indentation is preserved for usable code.',
    'Punctuation, entities, and URL rewriting stay off by default.',
  ],
  sample: `1 | function greet(name) {
2 |   const docs = "https://example.com/api%20guide?utm_source=docs";
3 |   console.log("Hello, " + name);
4 | }
`,
  shouldCleanUrls: false,
  shouldNormalizePunctuation: false,
  shouldDecodeHtmlEntities: false,
  preprocess: passthroughStage,
  transform,
  postprocess: passthroughStage,
}
