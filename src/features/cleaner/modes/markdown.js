import { passthroughStage } from './strategy'

const TRAILING_WHITESPACE = /[^\S\n]+$/gm
const EXCESS_BLANK_LINES = /\n{3,}/g
const INLINE_WHITESPACE_RUN = /([^\s\n])[^\S\n]{2,}(?=[^\s\n])/g
const MARKDOWN_MODE_STATE = Symbol('markdownModeState')
const FENCED_BLOCK_PREFIX = '__PASTECLEAN_MD_FENCE_'
const INLINE_CODE_PREFIX = '__PASTECLEAN_MD_INLINE_'

function isEscaped(value, index) {
  let slashCount = 0

  for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) {
    slashCount += 1
  }

  return slashCount % 2 === 1
}

function buildPlaceholder(prefix, index, originalValue) {
  const lineCount = originalValue.split('\n').length

  if (lineCount === 1) {
    return `${prefix}${index}__`
  }

  return Array.from({ length: lineCount }, (_, lineIndex) => `${prefix}${index}_${lineIndex}__`).join('\n')
}

function maskRanges(text, ranges, prefix) {
  if (ranges.length === 0) {
    return { text, placeholders: [] }
  }

  let cursor = 0
  const parts = []
  const placeholders = []

  for (let index = 0; index < ranges.length; index += 1) {
    const range = ranges[index]
    const originalValue = text.slice(range.start, range.end)
    const placeholder = buildPlaceholder(prefix, index, originalValue)

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

function restorePlaceholders(text, placeholders) {
  return placeholders.reduce(
    (restoredText, entry) => restoredText.split(entry.placeholder).join(entry.originalValue),
    text
  )
}

function findFencedBlockRanges(text) {
  const ranges = []
  const lines = text.split('\n')
  let offset = 0

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const openingMatch = line.match(/^( {0,3})(`{3,}|~{3,})(.*)$/)

    if (!openingMatch) {
      offset += line.length + 1
      continue
    }

    const fence = openingMatch[2]
    const fenceCharacter = fence[0]
    const startOffset = offset
    let endIndex = index
    let endOffset = offset + line.length

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const nextLine = lines[cursor]
      const closingMatch = nextLine.match(/^( {0,3})(`{3,}|~{3,})\s*$/)

      endOffset += 1 + nextLine.length

      if (closingMatch && closingMatch[2][0] === fenceCharacter && closingMatch[2].length >= fence.length) {
        endIndex = cursor
        break
      }
    }

    if (endIndex === index && index < lines.length - 1) {
      endOffset = text.length
    }

    ranges.push({
      start: startOffset,
      end: Math.min(endOffset, text.length),
    })

    for (let cursor = index; cursor <= endIndex; cursor += 1) {
      offset += lines[cursor].length + 1
    }

    if (endIndex === lines.length - 1) {
      offset -= 1
    }

    index = endIndex
  }

  return ranges
}

function findInlineCodeRanges(text) {
  const ranges = []

  for (let cursor = 0; cursor < text.length; cursor += 1) {
    if (text[cursor] !== '`' || isEscaped(text, cursor)) {
      continue
    }

    let fenceLength = 1

    while (text[cursor + fenceLength] === '`') {
      fenceLength += 1
    }

    const fence = '`'.repeat(fenceLength)
    const endIndex = text.indexOf(fence, cursor + fenceLength)

    if (endIndex === -1) {
      cursor += fenceLength - 1
      continue
    }

    ranges.push({
      start: cursor,
      end: endIndex + fenceLength,
    })

    cursor = endIndex + fenceLength - 1
  }

  return ranges
}

function preprocess(text, options = {}) {
  if (options.preserveMarkdownCode === false) {
    return passthroughStage(text)
  }

  const fencedBlocks = maskRanges(text, findFencedBlockRanges(text), FENCED_BLOCK_PREFIX)
  const inlineCode = maskRanges(fencedBlocks.text, findInlineCodeRanges(fencedBlocks.text), INLINE_CODE_PREFIX)

  options[MARKDOWN_MODE_STATE] = {
    fencedBlocks: fencedBlocks.placeholders,
    inlineCode: inlineCode.placeholders,
  }

  return { text: inlineCode.text }
}

function transform(text, options = {}) {
  let normalizedHeadings = 0
  let normalizedBullets = 0
  const markdownState = options[MARKDOWN_MODE_STATE]
  const protectedCodeRegions =
    (markdownState?.fencedBlocks.length ?? 0) + (markdownState?.inlineCode.length ?? 0)

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
        { label: 'Protected code regions', value: protectedCodeRegions },
      ],
      highlights: [
        'Document structure such as headings, lists, and spacing is preserved.',
        options.preserveMarkdownCode === false
          ? 'Markdown code spans and fenced blocks are treated like prose when protection is disabled.'
          : 'Fenced code blocks and inline code spans are restored exactly after prose cleanup.',
      ],
    },
  }
}

function postprocess(text, options = {}) {
  const markdownState = options[MARKDOWN_MODE_STATE]

  if (!markdownState) {
    return passthroughStage(text)
  }

  delete options[MARKDOWN_MODE_STATE]

  const withInlineCode = restorePlaceholders(text, markdownState.inlineCode)
  return {
    text: restorePlaceholders(withInlineCode, markdownState.fencedBlocks),
  }
}

export const markdownMode = {
  id: 'markdown',
  label: 'Markdown',
  description: 'Preserves headings, lists, and spacing while cleaning paste damage.',
  rules: [
    'Headings and lists stay in Markdown form.',
    'Spacing is normalized in prose without flattening fenced code blocks.',
    'Inline code and fenced blocks are protected from punctuation and URL rewriting by default.',
  ],
  sample: `##Launch Notes

* Review the docs link:
  https://www.google.com/url?q=https%3A%2F%2Fexample.com%2Fdocs%2FQuarterly%2520Plan%3Futm_source%3Dnewsletter%26keep%3D1&sa=D

\`\`\`js
const docs = "https://example.com/A%20B?utm_source=test&keep=1";
\`\`\`
`,
  shouldCleanUrls: true,
  shouldNormalizePunctuation: false,
  shouldDecodeHtmlEntities: true,
  defaultCleaningOptions: {
    preserveMarkdownCode: true,
  },
  preprocess,
  transform,
  postprocess,
}
