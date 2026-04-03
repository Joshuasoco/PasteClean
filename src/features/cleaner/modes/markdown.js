import { passthroughStage } from './strategy'

const TRAILING_WHITESPACE = /[^\S\n]+$/gm
const EXCESS_BLANK_LINES = /\n{3,}/g
const INLINE_WHITESPACE_RUN = /([^\s\n])[^\S\n]{2,}(?=[^\s\n])/g

function transform(text, options = {}) {
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

export const markdownMode = {
  id: 'markdown',
  label: 'Markdown',
  description: 'Preserves headings, lists, and spacing while cleaning paste damage.',
  rules: [
    'Headings and lists stay in Markdown form.',
    'Spacing is normalized without flattening the document.',
    'URL cleanup stays on, but smart punctuation is conservative by default.',
  ],
  sample: `##Launch Notes

* Review the docs link:
  https://www.google.com/url?q=https%3A%2F%2Fexample.com%2Fdocs%2FQuarterly%2520Plan%3Futm_source%3Dnewsletter%26keep%3D1&sa=D

+ Confirm rollout checklist
+ Share update with the team
`,
  shouldCleanUrls: true,
  shouldNormalizePunctuation: false,
  shouldDecodeHtmlEntities: true,
  preprocess: passthroughStage,
  transform,
  postprocess: passthroughStage,
}
