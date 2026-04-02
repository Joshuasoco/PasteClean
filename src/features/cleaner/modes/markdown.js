const TRAILING_WHITESPACE = /[^\S\n]+$/gm
const EXCESS_BLANK_LINES = /\n{3,}/g
const INLINE_WHITESPACE_RUN = /([^\s\n])[ \t]{2,}(?=[^\s\n])/g

export function markdownMode(text, options = {}) {
  let normalizedHeadings = 0
  let normalizedBullets = 0

  let cleaned = text
    .split('\n')
    .map((line) => {
      const trimmedRight = options.cleanWhitespace === false ? line : line.replace(TRAILING_WHITESPACE, '')
      const normalizedHeading = trimmedRight.replace(/^\s{0,3}(#{1,6})([^#\s])/u, (match, hashes, content) => {
        normalizedHeadings += 1
        return `${hashes} ${content}`
      })

      const normalizedBullet = normalizedHeading.replace(/^\s*[*+]\s+/u, () => {
        normalizedBullets += 1
        return '- '
      })

      return normalizedBullet
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
      title: 'Markdown-preserving cleanup',
      stats: [
        { label: 'Headings normalized', value: normalizedHeadings },
        { label: 'Bullets standardized', value: normalizedBullets },
      ],
      highlights: [
        'Document structure such as headings, lists, and spacing is preserved.',
        'Markdown stays readable while paste damage gets cleaned away.',
      ],
    },
  }
}
