import { passthroughStage } from './strategy'

const TRAILING_WHITESPACE = /[^\S\n]+$/gm
const EXCESS_BLANK_LINES = /\n[ \t]*\n(?:[ \t]*\n)+/g
const INLINE_WHITESPACE_RUN = /([^\s\n])[^\S\n]{2,}(?=[^\s\n])/g
const HTML_TAG_PATTERN = /<\/?[a-z][^>\n]*>/gi
const BLOCK_HTML_TAG_PATTERN =
  /<\/?(?:address|article|aside|blockquote|br|caption|dd|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)\b[^>]*>/gi

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

function stripHtmlTags(value) {
  const tagsRemoved = value.match(HTML_TAG_PATTERN)?.length ?? 0

  if (tagsRemoved === 0) {
    return {
      text: value,
      tagsRemoved: 0,
    }
  }

  const text = value
    .replace(BLOCK_HTML_TAG_PATTERN, '\n')
    .replace(HTML_TAG_PATTERN, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')

  return {
    text,
    tagsRemoved,
  }
}

function transform(text, options = {}) {
  const markdownStrippedText = stripInlineMarkdown(stripMarkdownLinks(text))
  const htmlStrippedResult = options.stripHtmlTags ? stripHtmlTags(markdownStrippedText) : { text: markdownStrippedText, tagsRemoved: 0 }
  let structuralTokensRemoved = 0

  let cleaned = htmlStrippedResult.text
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
        { label: 'HTML tags removed', value: htmlStrippedResult.tagsRemoved },
        { label: 'Paragraphs kept readable', value: cleaned ? cleaned.split(/\n{2,}/).length : 0 },
      ],
      highlights: [
        'Writing mode stays conservative by default and removes copied formatting markers first.',
        options.stripHtmlTags
          ? 'Aggressive HTML tag stripping is enabled for pasted markup fragments.'
          : 'HTML tag stripping stays optional so visible prose is not over-cleaned by default.',
      ],
    },
  }
}

export const plainMode = {
  id: 'plain',
  label: 'Plain text',
  description: 'Conservative writing cleanup for prose. It removes copied formatting markers by default and leaves stronger HTML and wrapped-URL cleanup behind optional toggles.',
  rules: [
    'Copied Markdown markers, quote prefixes, and list bullets are removed.',
    'Paragraph spacing stays readable without aggressively rewriting visible prose by default.',
    'Aggressive Writing can additionally strip pasted HTML tags and repair wrapped URLs before URL cleanup.',
  ],
  sample: `# Weekly Update

- "Quarterly plan" &amp; weird&nbsp;spacing.
- Visit [campaign page](https://shop.example.com/New%20Drop?utm_campaign=spring-launch&utm_content=hero-banner&color=blue)
> Pulled from notes with extra formatting.
`,
  shouldCleanUrls: true,
  shouldNormalizePunctuation: true,
  shouldDecodeHtmlEntities: true,
  defaultCleaningOptions: {
    aggressiveWriting: false,
    stripHtmlTags: false,
    repairWrappedUrls: false,
  },
  preprocess: passthroughStage,
  transform,
  postprocess: passthroughStage,
}
