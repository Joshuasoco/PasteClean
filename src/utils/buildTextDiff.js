function tokenizeWords(value) {
  return value.match(/\s+|[^\s]+/g) ?? []
}

function tokenizeLines(value) {
  return value.match(/[^\n]*\n|[^\n]+/g) ?? []
}

function pickTokenizer(before, after) {
  const wordBefore = tokenizeWords(before)
  const wordAfter = tokenizeWords(after)

  if (wordBefore.length <= 220 && wordAfter.length <= 220 && wordBefore.length * wordAfter.length <= 40000) {
    return { beforeTokens: wordBefore, afterTokens: wordAfter }
  }

  return {
    beforeTokens: tokenizeLines(before),
    afterTokens: tokenizeLines(after),
  }
}

function appendSegment(segments, type, value) {
  if (!value) {
    return
  }

  const lastSegment = segments.at(-1)

  if (lastSegment && lastSegment.type === type) {
    lastSegment.value += value
    return
  }

  segments.push({ type, value })
}

function buildOperations(beforeTokens, afterTokens) {
  const rows = beforeTokens.length + 1
  const columns = afterTokens.length + 1
  const matrix = Array.from({ length: rows }, () => Array(columns).fill(0))

  for (let beforeIndex = beforeTokens.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
    for (let afterIndex = afterTokens.length - 1; afterIndex >= 0; afterIndex -= 1) {
      if (beforeTokens[beforeIndex] === afterTokens[afterIndex]) {
        matrix[beforeIndex][afterIndex] = matrix[beforeIndex + 1][afterIndex + 1] + 1
      } else {
        matrix[beforeIndex][afterIndex] = Math.max(
          matrix[beforeIndex + 1][afterIndex],
          matrix[beforeIndex][afterIndex + 1]
        )
      }
    }
  }

  const operations = []
  let beforeIndex = 0
  let afterIndex = 0

  while (beforeIndex < beforeTokens.length && afterIndex < afterTokens.length) {
    if (beforeTokens[beforeIndex] === afterTokens[afterIndex]) {
      operations.push({ type: 'equal', value: beforeTokens[beforeIndex] })
      beforeIndex += 1
      afterIndex += 1
      continue
    }

    if (matrix[beforeIndex + 1][afterIndex] >= matrix[beforeIndex][afterIndex + 1]) {
      operations.push({ type: 'removed', value: beforeTokens[beforeIndex] })
      beforeIndex += 1
    } else {
      operations.push({ type: 'added', value: afterTokens[afterIndex] })
      afterIndex += 1
    }
  }

  while (beforeIndex < beforeTokens.length) {
    operations.push({ type: 'removed', value: beforeTokens[beforeIndex] })
    beforeIndex += 1
  }

  while (afterIndex < afterTokens.length) {
    operations.push({ type: 'added', value: afterTokens[afterIndex] })
    afterIndex += 1
  }

  return operations
}

export function buildTextDiff(before, after) {
  const safeBefore = before ?? ''
  const safeAfter = after ?? ''
  const { beforeTokens, afterTokens } = pickTokenizer(safeBefore, safeAfter)
  const operations = buildOperations(beforeTokens, afterTokens)
  const beforeSegments = []
  const afterSegments = []
  let removedCount = 0
  let addedCount = 0

  for (const operation of operations) {
    if (operation.type === 'equal') {
      appendSegment(beforeSegments, 'equal', operation.value)
      appendSegment(afterSegments, 'equal', operation.value)
      continue
    }

    if (operation.type === 'removed') {
      appendSegment(beforeSegments, 'removed', operation.value)
      removedCount += 1
      continue
    }

    appendSegment(afterSegments, 'added', operation.value)
    addedCount += 1
  }

  return {
    beforeSegments,
    afterSegments,
    stats: {
      removedCount,
      addedCount,
      changed: removedCount + addedCount > 0,
    },
  }
}
