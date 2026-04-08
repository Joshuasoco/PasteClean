const DESTINATION_PRESET_DEFINITIONS = [
  {
    id: 'none',
    label: 'No destination',
    shortLabel: 'None',
    description: 'Keep the cleaned result as-is inside the workspace.',
    highlights: ['Best when you only want cleanup without any publish-target formatting tweaks.'],
    transform: passthroughDestinationTransform,
  },
  {
    id: 'plain',
    label: 'Plain text',
    shortLabel: 'Plain',
    description: 'Trim outer blank space and keep the output easy to paste anywhere.',
    highlights: ['Leaves paragraphs intact while removing extra outer spacing.'],
    transform: applyPlainDestinationPreset,
  },
  {
    id: 'email',
    label: 'Email-ready',
    shortLabel: 'Email',
    description: 'Keeps readable spacing and standard hyphen bullets for message editors.',
    highlights: ['Normalizes list bullets and keeps blank-line spacing conservative for email clients.'],
    transform: applyEmailDestinationPreset,
  },
  {
    id: 'markdown',
    label: 'Markdown-ready',
    shortLabel: 'Markdown',
    description: 'Uses Markdown-friendly hyphen bullets and steady paragraph spacing.',
    highlights: ['Turns list glyphs into Markdown bullets without touching non-list paragraphs.'],
    transform: applyMarkdownDestinationPreset,
  },
  {
    id: 'docs',
    label: 'Docs / CMS',
    shortLabel: 'Docs',
    description: 'Repairs soft-wrapped prose lines so the output pastes into editors as real paragraphs.',
    highlights: ['Joins wrapped prose lines while leaving lists, headings, and code-like blocks alone.'],
    transform: applyDocsDestinationPreset,
  },
  {
    id: 'linkedin',
    label: 'LinkedIn-ready',
    shortLabel: 'LinkedIn',
    description: 'Breaks dense paragraphs into shorter blocks and uses presentation-friendly bullets.',
    highlights: ['Shortens long prose blocks for scan-heavy social posts.'],
    transform: applyLinkedInDestinationPreset,
  },
]

const DESTINATION_PRESET_MAP = new Map(DESTINATION_PRESET_DEFINITIONS.map((preset) => [preset.id, preset]))
const BULLET_PATTERN = /^(\s*)(?:[-*+]|[\u2022\u25E6\u25AA\u25B9\u25B8\u25BA])\s+(.+)$/
const ORDERED_LIST_PATTERN = /^\s*[0-9]+[.)]\s+/
const HEADING_PATTERN = /^\s{0,3}(?:#{1,6}\s+|[A-Z][A-Z0-9\s/&-]{2,}:?$)/
const CODE_FENCE_PATTERN = /^\s*(?:```|~~~)/

function passthroughDestinationTransform(text) {
  return {
    text,
    changesApplied: 0,
    stats: [],
  }
}

function normalizeInput(value) {
  return (value ?? '').replace(/\r\n?/g, '\n')
}

function clampBlankLines(text) {
  const nextText = text.replace(/\n{3,}/g, '\n\n')

  return {
    text: nextText,
    changed: nextText !== text,
  }
}

function trimOuterWhitespace(text) {
  const nextText = text.replace(/^\s+|\s+$/g, '')

  return {
    text: nextText,
    changed: nextText !== text,
  }
}

function normalizeBullets(text, bulletCharacter = '-') {
  let changedCount = 0
  const nextText = text
    .split('\n')
    .map((line) => {
      if (ORDERED_LIST_PATTERN.test(line)) {
        return line
      }

      const match = line.match(BULLET_PATTERN)

      if (!match) {
        return line
      }

      changedCount += 1
      return `${match[1]}${bulletCharacter} ${match[2]}`
    })
    .join('\n')

  return {
    text: nextText,
    changedCount,
  }
}

function isStructuralLine(line) {
  const trimmed = line.trim()

  if (!trimmed) {
    return true
  }

  return (
    BULLET_PATTERN.test(line) ||
    ORDERED_LIST_PATTERN.test(line) ||
    HEADING_PATTERN.test(trimmed) ||
    CODE_FENCE_PATTERN.test(trimmed) ||
    /^>\s+/.test(trimmed) ||
    /^[|`]/.test(trimmed)
  )
}

function canJoinProseLines(currentLine, nextLine) {
  const current = currentLine.trimEnd()
  const next = nextLine.trimStart()

  if (!current || !next) {
    return false
  }

  if (isStructuralLine(current) || isStructuralLine(next)) {
    return false
  }

  if (/[.!?:]$/.test(current) && /^[A-Z]/.test(next)) {
    return false
  }

  return !/[-\u2010\u2011]$/.test(current)
}

function joinSoftWrappedParagraphs(text) {
  const lines = text.split('\n')
  const joinedLines = []
  let joinedCount = 0

  for (let index = 0; index < lines.length; index += 1) {
    let currentLine = lines[index]

    while (index + 1 < lines.length && canJoinProseLines(currentLine, lines[index + 1])) {
      currentLine = `${currentLine.trimEnd()} ${lines[index + 1].trimStart()}`
      joinedCount += 1
      index += 1
    }

    joinedLines.push(currentLine)
  }

  return {
    text: joinedLines.join('\n'),
    joinedCount,
  }
}

function splitIntoLinkedInBlocks(text) {
  const paragraphs = text.split(/\n{2,}/)
  let splitCount = 0
  const nextParagraphs = paragraphs.flatMap((paragraph) => {
    const trimmed = paragraph.trim()

    if (!trimmed || isStructuralLine(trimmed) || trimmed.length < 140) {
      return [paragraph]
    }

    const sentences = trimmed.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g)

    if (!sentences || sentences.length < 3) {
      return [paragraph]
    }

    splitCount += 1
    const grouped = []

    for (let index = 0; index < sentences.length; index += 2) {
      grouped.push(sentences.slice(index, index + 2).join(' ').trim())
    }

    return grouped
  })

  return {
    text: nextParagraphs.join('\n\n'),
    splitCount,
  }
}

function finalizeDestinationResult(text, stats) {
  return {
    text,
    changesApplied: stats.reduce((total, entry) => total + entry.value, 0),
    stats: stats.filter((entry) => entry.value > 0),
  }
}

function applyPlainDestinationPreset(value) {
  const normalized = normalizeInput(value)
  const trimmed = trimOuterWhitespace(normalized)
  const blankLines = clampBlankLines(trimmed.text)

  return finalizeDestinationResult(blankLines.text, [
    { label: 'Outer spacing trimmed', value: trimmed.changed ? 1 : 0 },
    { label: 'Blank-line runs tightened', value: blankLines.changed ? 1 : 0 },
  ])
}

function applyEmailDestinationPreset(value) {
  const plain = applyPlainDestinationPreset(value)
  const bullets = normalizeBullets(plain.text, '-')

  return finalizeDestinationResult(bullets.text, [
    ...plain.stats,
    { label: 'Bullets normalized for email', value: bullets.changedCount },
  ])
}

function applyMarkdownDestinationPreset(value) {
  const normalized = normalizeInput(value)
  const trimmed = trimOuterWhitespace(normalized)
  const blankLines = clampBlankLines(trimmed.text)
  const bullets = normalizeBullets(blankLines.text, '-')

  return finalizeDestinationResult(bullets.text, [
    { label: 'Outer spacing trimmed', value: trimmed.changed ? 1 : 0 },
    { label: 'Blank-line runs tightened', value: blankLines.changed ? 1 : 0 },
    { label: 'Bullets normalized for Markdown', value: bullets.changedCount },
  ])
}

function applyDocsDestinationPreset(value) {
  const normalized = normalizeInput(value)
  const joined = joinSoftWrappedParagraphs(normalized)
  const trimmed = trimOuterWhitespace(joined.text)
  const blankLines = clampBlankLines(trimmed.text)

  return finalizeDestinationResult(blankLines.text, [
    { label: 'Wrapped prose lines joined', value: joined.joinedCount },
    { label: 'Outer spacing trimmed', value: trimmed.changed ? 1 : 0 },
    { label: 'Blank-line runs tightened', value: blankLines.changed ? 1 : 0 },
  ])
}

function applyLinkedInDestinationPreset(value) {
  const docs = applyDocsDestinationPreset(value)
  const bullets = normalizeBullets(docs.text, '•')
  const blocks = splitIntoLinkedInBlocks(bullets.text)

  return finalizeDestinationResult(blocks.text, [
    ...docs.stats,
    { label: 'Bullets styled for social posts', value: bullets.changedCount },
    { label: 'Dense paragraphs split into shorter blocks', value: blocks.splitCount },
  ])
}

export function getDestinationPresets() {
  return DESTINATION_PRESET_DEFINITIONS
}

export function getDestinationPresetDefinition(destinationPresetId) {
  return DESTINATION_PRESET_MAP.get(destinationPresetId) ?? DESTINATION_PRESET_MAP.get('none')
}

export function applyDestinationPreset(value, destinationPresetId) {
  const preset = getDestinationPresetDefinition(destinationPresetId)
  const normalizedValue = normalizeInput(value)
  const result = preset.transform(normalizedValue) ?? {}

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
