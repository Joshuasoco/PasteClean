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

export function codeMode(text) {
  let lineNumbersRemoved = 0

  const cleaned = text
    .split('\n')
    .map((line) => {
      const withoutNumber = removeLineNumberPrefix(line)

      if (withoutNumber !== line) {
        lineNumbersRemoved += 1
      }

      return withoutNumber.replace(TRAILING_WHITESPACE, '')
    })
    .join('\n')
    .replace(EXCESS_BLANK_LINES, '\n\n\n')
    .replace(/^\n+|\n+$/g, '')

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
