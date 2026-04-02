const TRAILING_WHITESPACE = /[^\S\n]+$/gm
const EXCESS_BLANK_LINES = /\n[ \t]*\n(?:[ \t]*\n)+/g

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

export function plainMode(text) {
  const strippedText = stripInlineMarkdown(stripMarkdownLinks(text))
  let structuralTokensRemoved = 0

  const cleaned = strippedText
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
        .replace(TRAILING_WHITESPACE, '')

      return nextLine
    })
    .join('\n')
    .replace(EXCESS_BLANK_LINES, '\n\n')
    .replace(/^\n+|\n+$/g, '')

  return {
    text: cleaned,
    summary: {
      title: 'Plain text cleanup',
      stats: [
        { label: 'Formatting markers removed', value: structuralTokensRemoved },
        { label: 'Paragraphs kept readable', value: cleaned ? cleaned.split('\n\n').length : 0 },
      ],
      highlights: [
        'Markdown markers and quote prefixes were stripped.',
        'The output is flattened into readable plain paragraphs.',
      ],
    },
  }
}
