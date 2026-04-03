import { passthroughStage } from './strategy'

const TRAILING_WHITESPACE = /[^\S\n]+$/gm
const EXCESS_BLANK_LINES = /\n{3,}/g
const INLINE_WHITESPACE_RUN = /([^\s\n])[^\S\n]{2,}(?=[^\s\n])/g
const REPLY_BOUNDARY_PATTERN =
  /^(On .+wrote:|From:\s.+|Sent:\s.+|To:\s.+|Subject:\s.+|-{2,}\s*Original Message\s*-{2,})$/i

function transform(text, options = {}) {
  const lines = text.split('\n')
  const keptLines = []
  let quotedLinesRemoved = 0
  let removedHeaderChain = false

  for (const line of lines) {
    if (REPLY_BOUNDARY_PATTERN.test(line.trim())) {
      removedHeaderChain = true
      break
    }

    if (/^\s*>/.test(line)) {
      quotedLinesRemoved += 1
      continue
    }

    keptLines.push(options.cleanWhitespace === false ? line : line.replace(TRAILING_WHITESPACE, ''))
  }

  let cleaned = keptLines.join('\n')

  if (options.cleanWhitespace !== false) {
    cleaned = cleaned
      .replace(INLINE_WHITESPACE_RUN, '$1 ')
      .replace(EXCESS_BLANK_LINES, '\n\n')
      .replace(/^\n+|\n+$/g, '')
  }

  return {
    text: cleaned,
    summary: {
      title: 'Email cleanup',
      stats: [
        { label: 'Quoted lines removed', value: quotedLinesRemoved },
        { label: 'Reply chain removed', value: removedHeaderChain ? 'Yes' : 'No' },
      ],
      highlights: [
        'Quoted reply chains are removed to keep the newest message focused.',
        'Email text is left in a clean paragraph flow for reuse.',
      ],
    },
  }
}

export const emailMode = {
  id: 'email',
  label: 'Email',
  description: 'Keeps the latest message and removes quoted reply chains.',
  rules: [
    'Quoted email replies are removed.',
    'Reply-header blocks are cut away when detected.',
    'Readable punctuation and cleaned links stay enabled for the newest message.',
  ],
  sample: `Hi team,

Please review the updated brief:
https://shop.example.com/New%20Drop?utm_campaign=spring-launch&color=blue

Thanks,
Alex

On Tue, Apr 1, 2026 at 9:14 AM Morgan wrote:
> Previous thread content
> Older quoted reply
`,
  shouldCleanUrls: true,
  shouldNormalizePunctuation: true,
  shouldDecodeHtmlEntities: true,
  preprocess: passthroughStage,
  transform,
  postprocess: passthroughStage,
}
