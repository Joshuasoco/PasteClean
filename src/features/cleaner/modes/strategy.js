export function passthroughStage(text) {
  return { text }
}

export function normalizeStageResult(result, fallbackText) {
  if (typeof result === 'string') {
    return { text: result, summary: null }
  }

  if (!result || typeof result !== 'object') {
    return { text: fallbackText, summary: null }
  }

  return {
    text: result.text ?? fallbackText,
    summary: result.summary ?? null,
  }
}
