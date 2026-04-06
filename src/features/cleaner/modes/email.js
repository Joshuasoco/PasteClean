import { passthroughStage } from './strategy'

const TRAILING_WHITESPACE = /[^\S\n]+$/gm
const EXCESS_BLANK_LINES = /\n{3,}/g
const INLINE_WHITESPACE_RUN = /([^\s\n])[^\S\n]{2,}(?=[^\s\n])/g
const EMAIL_HEADER_NAMES = new Set(['from', 'sent', 'date', 'to', 'cc', 'bcc', 'subject', 'reply-to'])
const WEEKDAY_OR_MONTH_PATTERN =
  /\b(?:mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/i
const REPLY_BOUNDARY_PATTERNS = [
  /^On .+wrote:$/i,
  /^-{2,}\s*Original Message\s*-{2,}$/i,
  /^Begin forwarded message:$/i,
  /^[- ]*Forwarded message[- ]*$/i,
]

function parseHeaderLine(line) {
  const match = line.match(/^([A-Za-z-]+):\s*(.+)$/)

  if (!match) {
    return null
  }

  const name = match[1].toLowerCase()

  if (!EMAIL_HEADER_NAMES.has(name)) {
    return null
  }

  return {
    name,
    value: match[2],
  }
}

function headerValueLooksStructured(name, value) {
  const trimmedValue = value.trim()

  switch (name) {
    case 'from':
    case 'to':
    case 'cc':
    case 'bcc':
    case 'reply-to':
      return /@|<[^>]+>|;/.test(trimmedValue)
    case 'sent':
    case 'date':
      return /\d{1,2}:\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}/.test(trimmedValue) || WEEKDAY_OR_MONTH_PATTERN.test(trimmedValue)
    case 'subject':
      return Boolean(trimmedValue)
    default:
      return false
  }
}

function detectHeaderBlock(lines, startIndex) {
  const headers = []
  let continuationLines = 0
  let cursor = startIndex
  let previousWasHeader = false

  while (cursor < lines.length) {
    const line = lines[cursor]
    const trimmedLine = line.trim()

    if (!trimmedLine) {
      if (headers.length === 0) {
        return null
      }

      break
    }

    const header = parseHeaderLine(trimmedLine)

    if (header) {
      headers.push(header)
      previousWasHeader = true
      cursor += 1
      continue
    }

    if (previousWasHeader && /^[ \t]+/.test(line)) {
      continuationLines += 1
      cursor += 1
      continue
    }

    break
  }

  if (headers.length < 2) {
    return null
  }

  const headerNames = new Set(headers.map((header) => header.name))
  const structuredHeaders = headers.filter((header) => headerValueLooksStructured(header.name, header.value)).length
  const hasSenderOrTimestamp = headerNames.has('from') || headerNames.has('sent') || headerNames.has('date')
  const hasReplyContext =
    headerNames.has('to') || headerNames.has('cc') || headerNames.has('bcc') || headerNames.has('subject')

  if (!hasSenderOrTimestamp || (!hasReplyContext && headers.length < 3) || structuredHeaders < 2) {
    return null
  }

  return {
    startIndex,
    headerLinesRemoved: headers.length + continuationLines,
  }
}

function detectReplyBoundary(lines, startIndex) {
  const trimmedLine = lines[startIndex].trim()

  if (!trimmedLine) {
    return null
  }

  if (REPLY_BOUNDARY_PATTERNS.some((pattern) => pattern.test(trimmedLine))) {
    return {
      startIndex,
      detectedFormat: 'Reply separator',
      headerLinesRemoved: 1,
    }
  }

  const headerBlock = detectHeaderBlock(lines, startIndex)

  if (headerBlock) {
    return {
      ...headerBlock,
      detectedFormat: 'Quoted header block',
    }
  }

  return null
}

export function stripQuotedEmailChain(text, options = {}) {
  const lines = text.split('\n')
  const keptLines = []
  let quotedLinesRemoved = 0
  let headerLinesRemoved = 0
  let removedHeaderChain = false
  let detectedFormat = options.removeQuotedEmailChain === false ? 'Disabled' : 'None'

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]

    if (options.removeQuotedEmailChain !== false) {
      const boundary = detectReplyBoundary(lines, index)

      if (boundary) {
        removedHeaderChain = true
        headerLinesRemoved = boundary.headerLinesRemoved
        detectedFormat = boundary.detectedFormat
        break
      }
    }

    if (options.removeQuotedEmailChain !== false && /^\s*>/.test(line)) {
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
      quotedLinesRemoved,
      headerLinesRemoved,
      removedHeaderChain,
      detectedFormat,
    },
  }
}

function transform(text, options = {}) {
  const emailCleanup = stripQuotedEmailChain(text, options)

  return {
    text: emailCleanup.text,
    summary: {
      title: 'Email cleanup',
      stats: [
        { label: 'Quoted lines removed', value: emailCleanup.summary.quotedLinesRemoved },
        { label: 'Header lines removed', value: emailCleanup.summary.headerLinesRemoved },
        { label: 'Reply chain removed', value: emailCleanup.summary.removedHeaderChain ? 'Yes' : 'No' },
        { label: 'Reply format detected', value: emailCleanup.summary.detectedFormat },
      ],
      highlights: [
        options.removeQuotedEmailChain === false
          ? 'Quoted reply cleanup is off, so older thread content stays visible.'
          : 'Quoted reply chains are removed to keep the newest message focused.',
        'Structured header blocks from common email clients are detected more conservatively to avoid false positives.',
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
    'Multi-line reply-header blocks from common mail clients are cut away when detected.',
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
  defaultCleaningOptions: {
    removeQuotedEmailChain: true,
  },
  preprocess: passthroughStage,
  transform,
  postprocess: passthroughStage,
}
