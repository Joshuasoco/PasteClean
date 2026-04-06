import { stripQuotedEmailChain } from './modes/email'

const SOURCE_PRESET_DEFINITIONS = [
  {
    id: 'none',
    label: 'No preset',
    shortLabel: 'No preset',
    description: 'Use PasteClean mode rules without extra source-specific cleanup.',
    suggestedMode: null,
    highlights: ['Mode-aware cleanup stays in full control.'],
    transform: passthroughSourceTransform,
  },
  {
    id: 'gmail',
    label: 'Gmail',
    shortLabel: 'Gmail',
    description: 'Strips quoted reply chains, forwarded headers, and common signature clutter from copied Gmail threads.',
    suggestedMode: 'email',
    highlights: [
      'Quoted Gmail reply chains are removed before the regular mode cleanup runs.',
      'Common mobile and separator-based signatures are stripped when they look like thread footer noise.',
    ],
    transform: applyGmailPreset,
  },
  {
    id: 'pdf',
    label: 'PDF copy',
    shortLabel: 'PDF',
    description: 'Repairs hard wraps and hyphenated line breaks from copied PDF text.',
    suggestedMode: 'plain',
    highlights: [
      'Broken line wraps are merged back into readable paragraphs.',
      'Hyphenated word breaks across lines are repaired before other cleanup runs.',
    ],
    transform: applyPdfPreset,
  },
  {
    id: 'slack',
    label: 'Slack',
    shortLabel: 'Slack',
    description: 'Normalizes emoji-heavy list formatting and Slack-style bullets into cleaner prose-friendly text.',
    suggestedMode: 'plain',
    highlights: [
      'Emoji-led bullet lines are converted into stable list bullets.',
      'Slack bullet characters are normalized before shared cleanup runs.',
    ],
    transform: applySlackPreset,
  },
  {
    id: 'ai',
    label: 'AI chat',
    shortLabel: 'AI chat',
    description: 'Removes wrapper chatter, fenced response wrappers, and trailing helper lines common in AI output.',
    suggestedMode: 'plain',
    highlights: [
      'Lead-in phrases like "here is the cleaned-up version" are removed when they appear as wrapper text.',
      'Whole-response code fences and trailing "let me know" helper lines are stripped.',
    ],
    transform: applyAiPreset,
  },
]

const SOURCE_PRESET_MAP = new Map(SOURCE_PRESET_DEFINITIONS.map((preset) => [preset.id, preset]))
const BLANK_LINE_RUN = /\n{3,}/g
const LIST_ITEM_PATTERN = /^\s*(?:[-*+]|[0-9]+[.)]|[\u2022\u25E6\u25AA\u25B9\u25B8\u25BA])\s+/
const ALL_CAPS_HEADING_PATTERN = /^[A-Z][A-Z\s/&-]{3,}:?$/
const SLACK_BULLET_PATTERN = /^(\s*)[\u2022\u25E6\u25AA\u25B9\u25B8\u25BA]\s+(.+)$/
const SLACK_SHORTCODE_PATTERN = /^(\s*):[a-z0-9_+-]+:\s+(.+)$/i
const SLACK_EMOJI_PREFIX_PATTERN = /^(\s*)(?:\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*\s+)+(.+)$/u
const OUTER_CODE_FENCE_PATTERN = /^\s*(?:```|~~~)[\w-]*\n([\s\S]*?)\n(?:```|~~~)\s*$/u
const AI_TRAILING_HELP_PATTERN = /^(?:let me know if|if you(?:'d| would) like(?:,? I can)?|happy to help(?: further)?|I can also)\b/i
const GMAIL_MOBILE_SIGNATURE_PATTERN =
  /^(?:Sent from my (?:iPhone|iPad|Android|Galaxy|Pixel)|Get Outlook for (?:iOS|Android)|Get the Yahoo Mail app)$/i

function passthroughSourceTransform(text) {
  return {
    text,
    changesApplied: 0,
    stats: [],
  }
}

function normalizeInput(value) {
  return (value ?? '').replace(/\r\n?/g, '\n')
}

function finalizeSourceText(text, options = {}) {
  if (options.cleanWhitespace === false) {
    return text
  }

  return text.replace(BLANK_LINE_RUN, '\n\n').replace(/^\n+|\n+$/g, '')
}

function looksLikeSignatureLine(line) {
  const trimmed = line.trim()

  if (!trimmed) {
    return true
  }

  if (trimmed.length <= 42) {
    return true
  }

  return /@|https?:\/\/|\+?\d[\d\s().-]{6,}|(?:linkedin|github|twitter|x\.com)\.com/i.test(trimmed)
}

function removeTrailingSignatureBlock(lines) {
  for (let index = Math.max(lines.length - 6, 0); index < lines.length; index += 1) {
    const trimmed = lines[index].trim()

    if (!/^--$|^__$|^thanks,$|^best,$/i.test(trimmed)) {
      continue
    }

    const trailingLines = lines.slice(index + 1)
    const nonEmptyTrailingLines = trailingLines.filter((line) => line.trim())

    if (nonEmptyTrailingLines.length === 0 || nonEmptyTrailingLines.length > 4) {
      continue
    }

    if (!nonEmptyTrailingLines.every(looksLikeSignatureLine)) {
      continue
    }

    return {
      lines: lines.slice(0, index),
      removedCount: lines.length - index,
    }
  }

  return {
    lines,
    removedCount: 0,
  }
}

function applyGmailPreset(value, context = {}) {
  const normalized = normalizeInput(value)
  const emailCleanup = stripQuotedEmailChain(normalized, {
    cleanWhitespace: context.options?.cleanWhitespace,
    removeQuotedEmailChain: true,
  })
  let lines = emailCleanup.text.split('\n')
  let mobileSignatureLinesRemoved = 0

  lines = lines.filter((line) => {
    if (GMAIL_MOBILE_SIGNATURE_PATTERN.test(line.trim())) {
      mobileSignatureLinesRemoved += 1
      return false
    }

    return true
  })

  const signatureResult = removeTrailingSignatureBlock(lines)
  const text = finalizeSourceText(signatureResult.lines.join('\n'), context.options)
  const changesApplied =
    emailCleanup.summary.quotedLinesRemoved +
    emailCleanup.summary.headerLinesRemoved +
    mobileSignatureLinesRemoved +
    signatureResult.removedCount

  return {
    text,
    changesApplied,
    stats: [
      { label: 'Quoted lines removed', value: emailCleanup.summary.quotedLinesRemoved },
      { label: 'Header lines removed', value: emailCleanup.summary.headerLinesRemoved },
      { label: 'Signature lines removed', value: mobileSignatureLinesRemoved + signatureResult.removedCount },
    ],
  }
}

function looksLikeStructuralPdfLine(line) {
  const trimmed = line.trim()

  if (!trimmed) {
    return true
  }

  return LIST_ITEM_PATTERN.test(trimmed) || ALL_CAPS_HEADING_PATTERN.test(trimmed) || /^#{1,6}\s/.test(trimmed)
}

function getPdfJoinType(currentLine, nextLine) {
  const current = currentLine.trimEnd()
  const next = nextLine.trimStart()

  if (!current || !next) {
    return null
  }

  if (looksLikeStructuralPdfLine(current) || looksLikeStructuralPdfLine(next)) {
    return null
  }

  if (/[-\u2010\u2011]$/.test(current) && /^[a-z]/.test(next)) {
    return 'hyphen'
  }

  if (/[.!?]$/.test(current) && /^[A-Z]/.test(next)) {
    return null
  }

  if (/[:,;]$/.test(current)) {
    return 'space'
  }

  if (/^[a-z0-9"'(\[]/.test(next)) {
    return 'space'
  }

  if (current.length >= 55 && /^[A-Z]/.test(next)) {
    return 'space'
  }

  return null
}

function applyPdfPreset(value, context = {}) {
  const lines = normalizeInput(value).split('\n')
  const repairedLines = []
  let joinedLines = 0
  let hyphenatedBreaksRepaired = 0

  for (let index = 0; index < lines.length; index += 1) {
    let currentLine = lines[index]

    while (index + 1 < lines.length) {
      const joinType = getPdfJoinType(currentLine, lines[index + 1])

      if (!joinType) {
        break
      }

      if (joinType === 'hyphen') {
        currentLine = currentLine.replace(/[-\u2010\u2011]\s*$/, '') + lines[index + 1].trimStart()
        hyphenatedBreaksRepaired += 1
      } else {
        currentLine = `${currentLine.replace(/[^\S\n]+$/g, '')} ${lines[index + 1].trimStart()}`
      }

      joinedLines += 1
      index += 1
    }

    repairedLines.push(currentLine)
  }

  return {
    text: finalizeSourceText(repairedLines.join('\n'), context.options),
    changesApplied: joinedLines + hyphenatedBreaksRepaired,
    stats: [
      { label: 'Broken lines joined', value: joinedLines },
      { label: 'Hyphenated breaks repaired', value: hyphenatedBreaksRepaired },
    ],
  }
}

function normalizeSlackLine(line) {
  const bulletMatch = line.match(SLACK_BULLET_PATTERN)

  if (bulletMatch) {
    return {
      text: `${bulletMatch[1]}- ${bulletMatch[2]}`,
      changed: true,
    }
  }

  const shortcodeMatch = line.match(SLACK_SHORTCODE_PATTERN)

  if (shortcodeMatch) {
    return {
      text: `${shortcodeMatch[1]}- ${shortcodeMatch[2]}`,
      changed: true,
    }
  }

  const emojiPrefixMatch = line.match(SLACK_EMOJI_PREFIX_PATTERN)

  if (emojiPrefixMatch) {
    return {
      text: `${emojiPrefixMatch[1]}- ${emojiPrefixMatch[2]}`,
      changed: true,
    }
  }

  return {
    text: line,
    changed: false,
  }
}

function applySlackPreset(value, context = {}) {
  const lines = normalizeInput(value).split('\n')
  let linesNormalized = 0
  const nextLines = lines.map((line) => {
    const normalized = normalizeSlackLine(line)

    if (normalized.changed) {
      linesNormalized += 1
    }

    return normalized.text
  })

  return {
    text: finalizeSourceText(nextLines.join('\n'), context.options),
    changesApplied: linesNormalized,
    stats: [{ label: 'Slack list lines normalized', value: linesNormalized }],
  }
}

function unwrapOuterCodeFence(text) {
  const match = text.match(OUTER_CODE_FENCE_PATTERN)

  if (!match) {
    return {
      text,
      removedCount: 0,
    }
  }

  return {
    text: match[1],
    removedCount: 1,
  }
}

function stripAiLeadLines(lines) {
  let removedCount = 0

  while (lines.length > 0) {
    const trimmed = lines[0].trim()

    if (!trimmed) {
      lines.shift()
      removedCount += 1
      continue
    }

    const normalized = trimmed
      .replace(/^#{1,6}\s*/, '')
      .replace(/^\*{1,2}|\*{1,2}:?$/g, '')
      .replace(/[":*]+$/g, '')
      .trim()

    if (
      /^(?:sure|certainly|absolutely|of course)[,.!\s-]*(?:here(?:'s| is).*)?$/i.test(normalized) ||
      /^(?:here(?:'s| is)|below is|i(?:'ve| have))(?: .*)?(?:clean(?:ed|ed-up)|rewrite|rewritten|revised|updated|polished)\b/i.test(
        normalized
      ) ||
      /^(?:clean(?:ed|ed-up)|revised|updated|final)\s+(?:version|copy|text|draft)\b/i.test(normalized)
    ) {
      lines.shift()
      removedCount += 1
      continue
    }

    break
  }

  return removedCount
}

function stripAiTrailingHelp(lines) {
  let removedCount = 0

  while (lines.length > 0) {
    const trimmed = lines.at(-1)?.trim() ?? ''

    if (!trimmed) {
      lines.pop()
      removedCount += 1
      continue
    }

    if (AI_TRAILING_HELP_PATTERN.test(trimmed)) {
      lines.pop()
      removedCount += 1
      continue
    }

    break
  }

  return removedCount
}

function applyAiPreset(value, context = {}) {
  const normalized = normalizeInput(value)
  const lines = normalized.split('\n')
  const leadLinesRemoved = stripAiLeadLines(lines)
  const trailingLinesRemoved = stripAiTrailingHelp(lines)
  const unwrapped = unwrapOuterCodeFence(lines.join('\n'))

  return {
    text: finalizeSourceText(unwrapped.text, context.options),
    changesApplied: unwrapped.removedCount + leadLinesRemoved + trailingLinesRemoved,
    stats: [
      { label: 'Wrapper lines removed', value: leadLinesRemoved + trailingLinesRemoved },
      { label: 'Outer code fences removed', value: unwrapped.removedCount },
    ],
  }
}

export function getSourcePresets() {
  return SOURCE_PRESET_DEFINITIONS
}

export function getSourcePresetDefinition(sourcePresetId) {
  return SOURCE_PRESET_MAP.get(sourcePresetId) ?? SOURCE_PRESET_MAP.get('none')
}

export function applySourcePreset(value, sourcePresetId, context = {}) {
  const preset = getSourcePresetDefinition(sourcePresetId)
  const normalizedValue = normalizeInput(value)
  const result = preset.transform(normalizedValue, context) ?? {}

  return {
    text: typeof result.text === 'string' ? result.text : normalizedValue,
    preset,
    summary: {
      presetId: preset.id,
      presetLabel: preset.label,
      changesApplied: result.changesApplied ?? 0,
      stats: result.stats ?? [],
      highlights: preset.highlights,
    },
  }
}
