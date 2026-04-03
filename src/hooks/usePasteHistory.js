import { useEffect, useRef, useState } from 'react'
import { useStoredState } from './useStoredState'
import { STORAGE_KEYS } from '../utils/storageKeys'

const HISTORY_LIMIT = 20
const SAVE_DELAY_MS = 900

function createHistoryEntry({ input, result, mode, customRuleSummary }) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    input,
    cleanedText: result.cleanedText,
    mode,
    modeLabel: result.modeLabel,
    savedAt: new Date().toISOString(),
    urlChanges: result.urlSummary.urlsChanged,
    customReplacements: customRuleSummary.replacementsMade,
  }
}

export function usePasteHistory({ input, result, mode, customRuleSummary }) {
  const [history, setHistory] = useStoredState(STORAGE_KEYS.history, [])
  const [isSavingHistory, setIsSavingHistory] = useState(false)
  const hasInitialized = useRef(false)

  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true
      return undefined
    }

    if (!input.trim()) {
      setIsSavingHistory(false)
      return undefined
    }

    setIsSavingHistory(true)

    const timeoutId = window.setTimeout(() => {
      setHistory((currentHistory) => {
        const newestEntry = currentHistory[0]

        if (
          newestEntry &&
          newestEntry.input === input &&
          newestEntry.cleanedText === result.cleanedText &&
          newestEntry.mode === mode &&
          newestEntry.customReplacements === customRuleSummary.replacementsMade
        ) {
          return currentHistory
        }

        const nextEntry = createHistoryEntry({ input, result, mode, customRuleSummary })
        const dedupedHistory = currentHistory.filter(
          (entry) => entry.input !== nextEntry.input
        )

        return [nextEntry, ...dedupedHistory].slice(0, HISTORY_LIMIT)
      })
      setIsSavingHistory(false)
    }, SAVE_DELAY_MS)

    return () => window.clearTimeout(timeoutId)
  }, [customRuleSummary, input, mode, result, setHistory])

  function clearHistory() {
    setHistory([])
  }

  return {
    history,
    setHistory,
    clearHistory,
    historyLimit: HISTORY_LIMIT,
    isSavingHistory,
  }
}
