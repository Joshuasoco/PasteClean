const TRAILING_WHITESPACE = /[^\S\n]+$/gm
const EXCESS_BLANK_LINES = /\n[ \t]*\n(?:[ \t]*\n)+/g
const INLINE_WHITESPACE_RUN = /([^\s\n])[^\S\n]{2,}(?=[^\s\n])/g

function stripMarkdownLinks(value) {
  return value.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1 ($2)')
}

function stripInlineMarkdown(value) {
  return value
    .replace(/(```|~~~)/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(^|[^\w])(\*|_)([^*_]+)\2(?=[^\w]|$)/g, '$1$3')
    .replace(/~~(.*?)~~/g, '$1')
}

export function plainMode(text, options = {}) {
  const strippedText = stripInlineMarkdown(stripMarkdownLinks(text))
  let structuralTokensRemoved = 0

  let cleaned = strippedText
    .split('\n')
    .map((line) => {
      const nextLine = line
        .replace(/^\s{0,3}(#{1,6})\s+/u, () => {
          structuralTokensRemoved += 1
          return ''
        })
        .replace(/^\s*>\s?/u, () => {
          structuralTokensRemoved += 1
          return ''
        })
        .replace(/^\s*(?:[-*+]|\d+[.)])\s+/u, () => {
          structuralTokensRemoved += 1
          return ''
        })

      return options.cleanWhitespace === false ? nextLine : nextLine.replace(TRAILING_WHITESPACE, '')
    })
    .join('\n')

  if (options.cleanWhitespace !== false) {
    cleaned = cleaned
      .replace(INLINE_WHITESPACE_RUN, '$1 ')
      .replace(EXCESS_BLANK_LINES, '\n\n')
      .replace(/^\n+|\n+$/g, '')
  }

  return {
    text: cleaned,
    summary: {
      title: 'Plain text cleanup',
      stats: [
        { label: 'Formatting markers removed', value: structuralTokensRemoved },
        { label: 'Paragraphs kept readable', value: cleaned ? cleaned.split(/\n{2,}/).length : 0 },
      ],
      highlights: [
        'Markdown markers and quote prefixes were stripped.',
        'The output is flattened into readable plain paragraphs.',
      ],
    },
  }
}
