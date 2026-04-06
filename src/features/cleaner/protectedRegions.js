const PROTECTED_REGION_PATTERN = /\[\[pc:(skip|exact|links|code)\]\]([\s\S]*?)\[\[\/pc\]\]/g
const PROTECTED_LINK_PATTERN = /\bhttps?:\/\/[^\s<>"'`]+/g

export const PROTECTED_REGION_ACTIONS = [
  {
    id: 'skip',
    label: 'Do not clean',
    description: 'Keeps the selected text out of normal cleanup, but custom find/replace rules can still touch it.',
  },
  {
    id: 'exact',
    label: 'Preserve exactly',
    description: 'Keeps the selected text untouched, including custom rules.',
  },
  {
    id: 'links',
    label: 'Preserve links only',
    description: 'Protects URLs in the selected text while the surrounding words can still be cleaned.',
  },
  {
    id: 'code',
    label: 'Preserve code only',
    description: 'Runs the selected text through code-safe cleanup and shields it from the main prose cleanup path.',
  },
]

function createPlaceholder(prefix, index) {
  return `PCPROTECT${prefix}${index}TOKEN`
}

function createEmptyCounts() {
  return {
    skip: 0,
    exact: 0,
    links: 0,
    code: 0,
  }
}

function buildSummaryFromCounts(counts) {
  return {
    totalRegions: counts.skip + counts.exact + counts.links + counts.code,
    skipRegions: counts.skip,
    exactRegions: counts.exact,
    linkRegions: counts.links,
    codeRegions: counts.code,
  }
}

function maskProtectedLinks(text, finalRestores) {
  let nextText = ''
  let lastIndex = 0
  let match = PROTECTED_LINK_PATTERN.exec(text)

  while (match) {
    const placeholder = createPlaceholder('LINK', finalRestores.length)
    nextText += `${text.slice(lastIndex, match.index)}${placeholder}`
    finalRestores.push({ placeholder, value: match[0] })
    lastIndex = match.index + match[0].length
    match = PROTECTED_LINK_PATTERN.exec(text)
  }

  nextText += text.slice(lastIndex)
  PROTECTED_LINK_PATTERN.lastIndex = 0
  return nextText
}

export function normalizeProtectedRegions(regions, textLength) {
  if (!Array.isArray(regions) || typeof textLength !== 'number') {
    return []
  }

  return regions
    .map((region) => {
      if (!region || !['skip', 'exact', 'links', 'code'].includes(region.type)) {
        return null
      }

      const start = Math.max(0, Math.min(Number(region.start) || 0, textLength))
      const end = Math.max(start, Math.min(Number(region.end) || 0, textLength))

      if (end <= start) {
        return null
      }

      return {
        id: typeof region.id === 'string' && region.id ? region.id : undefined,
        type: region.type,
        start,
        end,
      }
    })
    .filter(Boolean)
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .filter((region, index, sortedRegions) => index === 0 || region.start >= sortedRegions[index - 1].end)
}

export function countProtectedRegions(value) {
  if (Array.isArray(value)) {
    return value.length
  }

  return Array.from((value ?? '').matchAll(PROTECTED_REGION_PATTERN)).length
}

export function summarizeProtectedRegions(regions) {
  const counts = createEmptyCounts()

  for (const region of Array.isArray(regions) ? regions : []) {
    if (counts[region.type] !== undefined) {
      counts[region.type] += 1
    }
  }

  return buildSummaryFromCounts(counts)
}

export function restoreProtectedRegions(text, replacements = []) {
  let nextText = text

  for (const replacement of replacements) {
    nextText = nextText.split(replacement.placeholder).join(replacement.value)
  }

  return nextText
}

function buildRangeProtectedRegions(text, regions, context = {}) {
  const beforeCustom = []
  const afterCustom = []
  const counts = createEmptyCounts()
  const normalizedRegions = normalizeProtectedRegions(regions, text.length)
  let cursor = 0
  let nextText = ''

  for (const region of normalizedRegions) {
    const protectedValue = text.slice(region.start, region.end)

    nextText += text.slice(cursor, region.start)
    counts[region.type] += 1

    if (region.type === 'skip') {
      const placeholder = createPlaceholder('SKIP', beforeCustom.length)
      beforeCustom.push({ placeholder, value: protectedValue })
      nextText += placeholder
    } else if (region.type === 'exact') {
      const placeholder = createPlaceholder('EXACT', afterCustom.length)
      afterCustom.push({ placeholder, value: protectedValue })
      nextText += placeholder
    } else if (region.type === 'links') {
      nextText += maskProtectedLinks(protectedValue, afterCustom)
    } else {
      const placeholder = createPlaceholder('CODE', afterCustom.length)
      const codeSafeValue = typeof context.resolveCodeRegion === 'function' ? context.resolveCodeRegion(protectedValue) : protectedValue
      afterCustom.push({ placeholder, value: codeSafeValue })
      nextText += placeholder
    }

    cursor = region.end
  }

  nextText += text.slice(cursor)

  return {
    text: nextText,
    beforeCustom,
    afterCustom,
    summary: buildSummaryFromCounts(counts),
  }
}

function buildMarkerProtectedRegions(text, context = {}) {
  const beforeCustom = []
  const afterCustom = []
  const counts = createEmptyCounts()

  const transformedText = (text ?? '').replace(PROTECTED_REGION_PATTERN, (_, type, value) => {
    counts[type] += 1

    if (type === 'skip') {
      const placeholder = createPlaceholder('SKIP', beforeCustom.length)
      beforeCustom.push({ placeholder, value })
      return placeholder
    }

    if (type === 'exact') {
      const placeholder = createPlaceholder('EXACT', afterCustom.length)
      afterCustom.push({ placeholder, value })
      return placeholder
    }

    if (type === 'links') {
      return maskProtectedLinks(value, afterCustom)
    }

    const placeholder = createPlaceholder('CODE', afterCustom.length)
    const codeSafeValue = typeof context.resolveCodeRegion === 'function' ? context.resolveCodeRegion(value) : value
    afterCustom.push({ placeholder, value: codeSafeValue })
    return placeholder
  })

  return {
    text: transformedText,
    beforeCustom,
    afterCustom,
    summary: buildSummaryFromCounts(counts),
  }
}

export function extractProtectedRegions(text, context = {}) {
  const explicitRegions = normalizeProtectedRegions(context.regions, (text ?? '').length)

  if (explicitRegions.length > 0) {
    return buildRangeProtectedRegions(text ?? '', explicitRegions, context)
  }

  return buildMarkerProtectedRegions(text ?? '', context)
}

export function updateProtectedRegionsForInputChange(previousText, nextText, regions) {
  const normalizedRegions = normalizeProtectedRegions(regions, previousText.length)

  if (normalizedRegions.length === 0 || previousText === nextText) {
    return {
      regions: normalizeProtectedRegions(normalizedRegions, nextText.length),
      removedRegions: 0,
    }
  }

  let prefixLength = 0
  const maxPrefixLength = Math.min(previousText.length, nextText.length)

  while (prefixLength < maxPrefixLength && previousText[prefixLength] === nextText[prefixLength]) {
    prefixLength += 1
  }

  let previousSuffixIndex = previousText.length - 1
  let nextSuffixIndex = nextText.length - 1

  while (
    previousSuffixIndex >= prefixLength &&
    nextSuffixIndex >= prefixLength &&
    previousText[previousSuffixIndex] === nextText[nextSuffixIndex]
  ) {
    previousSuffixIndex -= 1
    nextSuffixIndex -= 1
  }

  const removedCount = previousText.length - prefixLength - (previousText.length - 1 - previousSuffixIndex)
  const addedCount = nextText.length - prefixLength - (nextText.length - 1 - nextSuffixIndex)
  const delta = addedCount - removedCount
  const changeStart = prefixLength
  const changeEnd = prefixLength + removedCount
  let removedRegions = 0

  const nextRegions = normalizedRegions
    .map((region) => {
      if (region.end <= changeStart) {
        return {
          ...region,
        }
      }

      if (region.start >= changeEnd) {
        return {
          ...region,
          start: region.start + delta,
          end: region.end + delta,
        }
      }

      removedRegions += 1
      return null
    })
    .filter(Boolean)

  return {
    regions: normalizeProtectedRegions(nextRegions, nextText.length),
    removedRegions,
  }
}
