import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
  BrushCleaning,
  ClipboardPaste,
  History,
  Link2Off,
  MoonStar,
  Quote,
  Settings,
  Sparkles,
  Sun,
  Trash2,
  UserCircle2,
} from 'lucide-react'
import {
  CLEANING_RULES,
  cleanText,
  getDefaultCleaningOptions,
  syncCleaningOptionsForModeChange,
} from './features/cleaner/cleanText'
import {
  applyDestinationPreset,
  getDestinationPresetDefinition,
  getDestinationPresets,
} from './features/cleaner/destinationPresets'
import { getModeDefinition, getModes } from './features/cleaner/modes'
import {
  PROTECTED_REGION_ACTIONS,
  countProtectedRegions,
  summarizeProtectedRegions,
  updateProtectedRegionsForInputChange,
} from './features/cleaner/protectedRegions'
import { getSourcePresetDefinition, getSourcePresets } from './features/cleaner/sourcePresets'
import { usePasteHistory } from './hooks/usePasteHistory'
import { useStoredState } from './hooks/useStoredState'
import { buildTextDiff } from './utils/buildTextDiff'
import { exportHistory } from './utils/exportHistory'
import { parseSettingsBackup, serializeSettingsBackup } from './utils/settingsBackup'
import { STORAGE_KEYS } from './utils/storageKeys'

const MODE_OPTIONS = getModes()
const SOURCE_PRESET_OPTIONS = getSourcePresets()
const DESTINATION_PRESET_OPTIONS = getDestinationPresets()
const DEFAULT_MODE = 'plain'
const DEFAULT_SOURCE_PRESET = 'none'
const DEFAULT_DESTINATION_PRESET = 'none'
const LEGAL_CONTENT = {
  privacy: {
    title: 'Privacy Policy',
    updatedAt: 'April 3, 2026',
    sections: [
      {
        heading: 'What We Store',
        body: [
          'PasteClean runs locally in your browser. Your text, settings, and history stay in local storage on your device.',
          'We do not send your pasted text to a remote server as part of the core cleaning flow.',
        ],
      },
      {
        heading: 'How Data Is Used',
        body: [
          'Saved history is only used to let you restore recent pastes in this browser profile.',
          'Cleaning settings are stored to keep your experience consistent between sessions.',
        ],
      },
      {
        heading: 'Your Controls',
        body: [
          'You can clear local history anytime from Profile > Clear local history.',
          'You can reset cleaning rules at any time from Settings.',
        ],
      },
    ],
  },
  terms: {
    title: 'Terms of Use',
    updatedAt: 'April 3, 2026',
    sections: [
      {
        heading: 'Use of the App',
        body: [
          'You may use PasteClean for personal or business text cleanup workflows.',
          'You are responsible for the content you paste and any output you publish or share.',
        ],
      },
      {
        heading: 'No Warranty',
        body: [
          'The app is provided as-is without warranties of accuracy, fitness, or uninterrupted availability.',
          'Always review cleaned output before relying on it in legal, medical, financial, or production-critical contexts.',
        ],
      },
      {
        heading: 'Limitation of Liability',
        body: [
          'To the extent permitted by law, the maintainers are not liable for indirect or consequential damages resulting from use of the app.',
          'If you do not agree with these terms, discontinue use of the app.',
        ],
      },
    ],
  },
}

function countWords(value) {
  return value.trim() ? value.trim().split(/\s+/).length : 0
}

function getModeLabel(modeId, fallback) {
  if (modeId === 'plain') return 'Writing'
  if (modeId === 'code') return 'Code'
  if (modeId === 'markdown') return 'Markdown'
  if (modeId === 'email') return 'Email'
  return fallback
}

function createRuleId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createProjectBoardId() {
  return `board-${createRuleId()}`
}

function buildDefaultBoardName(boardCount) {
  return `Project Board ${boardCount + 1}`
}

function createProjectBoard(name, boardCount) {
  const trimmedName = typeof name === 'string' ? name.trim() : ''
  const now = new Date().toISOString()

  return {
    id: createProjectBoardId(),
    name: trimmedName || buildDefaultBoardName(boardCount),
    createdAt: now,
    updatedAt: now,
    items: [],
  }
}

function createProjectBoardEntry({
  input,
  cleanedText,
  mode,
  modeLabel,
  sourcePreset,
  sourcePresetLabel,
  destinationPreset,
  destinationPresetLabel,
  protectedRegions,
}) {
  return {
    id: `board-entry-${createRuleId()}`,
    input,
    cleanedText,
    mode,
    modeLabel,
    sourcePreset,
    sourcePresetLabel,
    destinationPreset,
    destinationPresetLabel,
    protectedRegions: Array.isArray(protectedRegions) ? protectedRegions : [],
    savedAt: new Date().toISOString(),
  }
}

function formatSavedTimestamp(value) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return 'Saved just now'
  }
}

const WRITING_AGGRESSIVE_OPTION_KEYS = ['stripHtmlTags', 'repairWrappedUrls']

const MODE_SAFE_TOGGLES = {
  plain: [
    {
      key: 'aggressiveWriting',
      label: 'Aggressive Writing',
      description: 'Turns on the stronger Writing-only cleanup helpers below while keeping the default path conservative.',
    },
    {
      key: 'stripHtmlTags',
      label: 'Strip pasted HTML tags',
      description: 'Remove leftover tags like <div>, <p>, <br>, or <strong> from pasted writing.',
    },
    {
      key: 'repairWrappedUrls',
      label: 'Repair wrapped URLs',
      description: 'Rejoin links split across line breaks before tracking cleanup and readable URL formatting run.',
    },
  ],
  code: [
    {
      key: 'preserveCodeTokens',
      label: 'Code-safe cleanup',
      description: 'Protect string literals and executable tokens while still removing copied line numbers.',
    },
  ],
  markdown: [
    {
      key: 'preserveMarkdownCode',
      label: 'Preserve Markdown code fences',
      description: 'Keep fenced blocks and inline code untouched while prose cleanup still runs.',
    },
  ],
  email: [
    {
      key: 'removeQuotedEmailChain',
      label: 'Remove quoted email chain',
      description: 'Strip detected reply headers and quoted thread content from older messages.',
    },
  ],
}

function getModeSafeToggles(modeId) {
  return MODE_SAFE_TOGGLES[modeId] ?? []
}

function syncWritingAggressiveToggle(options) {
  return {
    ...options,
    aggressiveWriting: WRITING_AGGRESSIVE_OPTION_KEYS.every((key) => Boolean(options[key])),
  }
}

function toggleModeOption(options, optionKey) {
  if (optionKey === 'aggressiveWriting') {
    const nextValue = !options.aggressiveWriting

    return syncWritingAggressiveToggle({
      ...options,
      aggressiveWriting: nextValue,
      ...Object.fromEntries(WRITING_AGGRESSIVE_OPTION_KEYS.map((key) => [key, nextValue])),
    })
  }

  if (WRITING_AGGRESSIVE_OPTION_KEYS.includes(optionKey)) {
    return syncWritingAggressiveToggle({
      ...options,
      [optionKey]: !options[optionKey],
    })
  }

  return {
    ...options,
    [optionKey]: !options[optionKey],
  }
}

function getModeWarnings(modeId, options) {
  const warnings = []
  const urlCleanupEnabled =
    Boolean(options.stripTrackingParams) || Boolean(options.unwrapRedirects) || Boolean(options.decodeReadableUrls)

  if (modeId === 'code' && options.preserveCodeTokens === false) {
    warnings.push({
      title: 'Code-safe cleanup is off',
      body: 'Executable code and string literals can be rewritten by the cleanup rules you have enabled.',
    })

    if (options.normalizePunctuation) {
      warnings.push({
        title: 'Fix Quotes can change executable tokens',
        body: 'Smart punctuation may rewrite quotes or dashes inside code samples and string literals.',
      })
    }

    if (options.decodeHtmlEntities) {
      warnings.push({
        title: 'HTML entity decoding can change string literals',
        body: 'Items like &amp; will be converted before code output is restored.',
      })
    }

    if (urlCleanupEnabled) {
      warnings.push({
        title: 'Strip URLs can rewrite links inside code',
        body: 'Readable URLs and tracking cleanup can alter copied URLs stored in source code examples.',
      })
    }
  }

  if (modeId === 'markdown' && options.preserveMarkdownCode === false) {
    warnings.push({
      title: 'Markdown code protection is off',
      body: 'Fenced code blocks and inline code spans will be cleaned like prose.',
    })

    if (options.normalizePunctuation) {
      warnings.push({
        title: 'Fix Quotes can alter inline code',
        body: 'Quote normalization may change code examples when Markdown code protection is disabled.',
      })
    }

    if (options.decodeHtmlEntities) {
      warnings.push({
        title: 'HTML entity decoding can alter fenced blocks',
        body: 'Entities inside code fences and inline spans will be decoded when protection is off.',
      })
    }

    if (urlCleanupEnabled) {
      warnings.push({
        title: 'Strip URLs can rewrite fenced code samples',
        body: 'URL cleanup will also run inside Markdown code regions when code-fence protection is disabled.',
      })
    }

    if (options.cleanWhitespace) {
      warnings.push({
        title: 'Whitespace cleanup can reshape code blocks',
        body: 'Blank-line cleanup will also affect fenced code sections when protection is disabled.',
      })
    }
  }

  return warnings
}

function getSummaryStatValue(summary, label) {
  const matchedStat = summary?.stats?.find((entry) => entry.label === label)
  return typeof matchedStat?.value === 'number' ? matchedStat.value : 0
}

function formatSummaryItem(label, count) {
  if (!count) {
    return null
  }

  return `${label} (${count})`
}

function buildOutputChangeSummary(cleaningResult, diffStats) {
  if (!cleaningResult || !diffStats.changed) {
    return {
      changed: false,
      headline: 'No changes needed for current rules.',
      detail: '',
      items: [],
      note: '',
    }
  }

  const items = [
    formatSummaryItem('Formatting removed', getSummaryStatValue(cleaningResult.modeSummary, 'Formatting markers removed')),
    formatSummaryItem('HTML tags removed', getSummaryStatValue(cleaningResult.modeSummary, 'HTML tags removed')),
    formatSummaryItem('Protected regions', cleaningResult.protectedSummary?.totalRegions ?? 0),
    formatSummaryItem('Source fixes', cleaningResult.sourceSummary?.changesApplied ?? 0),
    formatSummaryItem('Entities decoded', cleaningResult.sharedSummary?.entitiesDecoded ?? 0),
    formatSummaryItem('Quotes normalized', cleaningResult.sharedSummary?.punctuationNormalized ?? 0),
    formatSummaryItem('Invisible characters removed', cleaningResult.sharedSummary?.invisibleCharsRemoved ?? 0),
    formatSummaryItem('Wrapped URLs repaired', cleaningResult.urlSummary?.wrappedUrlsRepaired ?? 0),
    formatSummaryItem('URLs cleaned', cleaningResult.urlSummary?.urlsChanged ?? 0),
    formatSummaryItem('Tracking params removed', cleaningResult.urlSummary?.trackingParamsRemoved ?? 0),
    formatSummaryItem('Custom replacements applied', cleaningResult.customRuleSummary?.replacementsMade ?? 0),
    formatSummaryItem('Destination tweaks', cleaningResult.destinationSummary?.changesApplied ?? 0),
  ].filter(Boolean)

  const destinationNote =
    cleaningResult.destinationPreset && cleaningResult.destinationPreset !== DEFAULT_DESTINATION_PRESET
      ? `${cleaningResult.destinationPresetLabel} destination active.`
      : ''

  return {
    changed: true,
    headline: 'Changes made',
    detail: `${diffStats.removedCount} removals, ${diffStats.addedCount} additions`,
    items: items.length > 0 ? items.slice(0, 6) : ['Text updated for current rules.'],
    note:
      cleaningResult.sourcePreset !== DEFAULT_SOURCE_PRESET
        ? `${cleaningResult.sourcePresetLabel} preset active${
            cleaningResult.sourcePresetSuggestedMode && cleaningResult.sourcePresetSuggestedMode !== cleaningResult.mode
              ? `. Best paired with ${getModeLabel(
                  cleaningResult.sourcePresetSuggestedMode,
                  getModeDefinition(cleaningResult.sourcePresetSuggestedMode).label
                )} mode.`
              : '.'
          }${destinationNote ? ` ${destinationNote}` : ''}`
        : destinationNote,
  }
}

function App() {
  const [mode, setMode] = useState(DEFAULT_MODE)
  const [input, setInput] = useState(() => getModeDefinition(DEFAULT_MODE).sample)
  const [protectedRegions, setProtectedRegions] = useState([])
  const [cleaningOptions, setCleaningOptions] = useState(() => getDefaultCleaningOptions(DEFAULT_MODE))
  const [customRules, setCustomRules] = useStoredState(STORAGE_KEYS.customRules, [])
  const [sourcePreset, setSourcePreset] = useStoredState(STORAGE_KEYS.sourcePreset, DEFAULT_SOURCE_PRESET)
  const [destinationPreset, setDestinationPreset] = useStoredState(
    STORAGE_KEYS.destinationPreset,
    DEFAULT_DESTINATION_PRESET
  )
  const [sourceMemory, setSourceMemory] = useStoredState(STORAGE_KEYS.sourceMemory, {})
  const [projectBoards, setProjectBoards] = useStoredState(STORAGE_KEYS.projectBoards, [])
  const [activeProjectBoardId, setActiveProjectBoardId] = useStoredState(STORAGE_KEYS.activeProjectBoardId, null)
  const [theme, setTheme] = useStoredState(STORAGE_KEYS.theme, 'light')
  const [livePreviewEnabled, setLivePreviewEnabled] = useState(true)
  const [toast, setToast] = useState('')
  const [lastAction, setLastAction] = useState('Live preview is active.')
  const [isCleaning, setIsCleaning] = useState(false)
  const [isPasting, setIsPasting] = useState(false)
  const [exportingHistoryFormat, setExportingHistoryFormat] = useState(null)
  const [activeMenu, setActiveMenu] = useState(null)
  const [activeLegalDoc, setActiveLegalDoc] = useState(null)
  const [activeModeGuide, setActiveModeGuide] = useState(null)
  const [isProtectPanelOpen, setIsProtectPanelOpen] = useState(false)
  const [recoverState, setRecoverState] = useState(null)
  const [displayedResult, setDisplayedResult] = useState(null)
  const [draftRuleFind, setDraftRuleFind] = useState('')
  const [draftRuleReplace, setDraftRuleReplace] = useState('')
  const [draftBoardName, setDraftBoardName] = useState('')
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null)
  const [isPwaInstalled, setIsPwaInstalled] = useState(false)
  const [inputSelection, setInputSelection] = useState({ start: 0, end: 0 })
  const inputRef = useRef(null)
  const menuWrapRef = useRef(null)
  const protectWrapRef = useRef(null)
  const settingsImportRef = useRef(null)

  const deferredInput = useDeferredValue(input)
  const deferredMode = useDeferredValue(mode)
  const deferredSourcePreset = useDeferredValue(sourcePreset)
  const deferredDestinationPreset = useDeferredValue(destinationPreset)
  const isDarkMode = theme === 'dark'

  const result = useMemo(
    () =>
      cleanText(deferredInput, deferredMode, {
        ...cleaningOptions,
        customRules,
        sourcePreset: deferredSourcePreset,
        protectedRegions,
      }),
    [cleaningOptions, customRules, deferredInput, deferredMode, deferredSourcePreset, protectedRegions]
  )

  const destinationResult = useMemo(
    () => applyDestinationPreset(result.cleanedText, deferredDestinationPreset),
    [deferredDestinationPreset, result.cleanedText]
  )

  const workspaceResult = useMemo(
    () => ({
      ...result,
      cleanedText: destinationResult.text,
      destinationPreset: destinationResult.preset.id,
      destinationPresetLabel: destinationResult.preset.label,
      destinationSummary: destinationResult.summary,
    }),
    [destinationResult, result]
  )

  useEffect(() => {
    const nextTheme = isDarkMode ? 'dark' : 'light'

    document.documentElement.dataset.theme = nextTheme
    document.documentElement.style.colorScheme = nextTheme
  }, [isDarkMode])

  useEffect(() => {
    if (!livePreviewEnabled) {
      return
    }

    setDisplayedResult(workspaceResult)
  }, [livePreviewEnabled, workspaceResult])

  useEffect(() => {
    if (sourcePreset === DEFAULT_SOURCE_PRESET) {
      return
    }

    setSourceMemory((current) => {
      const currentEntry = current[sourcePreset] ?? {}

      if (
        currentEntry.preferredMode === mode &&
        (currentEntry.preferredDestination ?? DEFAULT_DESTINATION_PRESET) === destinationPreset
      ) {
        return current
      }

      return {
        ...current,
        [sourcePreset]: {
          preferredMode: mode,
          preferredDestination: destinationPreset,
          updatedAt: new Date().toISOString(),
        },
      }
    })
  }, [destinationPreset, mode, setSourceMemory, sourcePreset])

  useEffect(() => {
    if (projectBoards.length === 0) {
      if (activeProjectBoardId !== null) {
        setActiveProjectBoardId(null)
      }

      return
    }

    if (!activeProjectBoardId || !projectBoards.some((board) => board.id === activeProjectBoardId)) {
      setActiveProjectBoardId(projectBoards[0].id)
    }
  }, [activeProjectBoardId, projectBoards, setActiveProjectBoardId])

  const { history, setHistory, clearHistory, historyLimit, isSavingHistory } = usePasteHistory({
    input,
    result: workspaceResult,
    mode,
    sourcePreset,
    destinationPreset,
    protectedRegions,
    customRuleSummary: workspaceResult.customRuleSummary,
  })

  useEffect(() => {
    const standaloneMediaQuery = window.matchMedia('(display-mode: standalone)')

    if (standaloneMediaQuery.matches) {
      setIsPwaInstalled(true)
    }

    function handleInstallPrompt(event) {
      event.preventDefault()
      setDeferredInstallPrompt(event)
    }

    function handleAppInstalled() {
      setIsPwaInstalled(true)
      setDeferredInstallPrompt(null)
      setToast('App installed.')
      setLastAction('Installed as app.')
    }

    window.addEventListener('beforeinstallprompt', handleInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  useEffect(() => {
    if (!toast) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      setToast('')
    }, 2200)

    return () => window.clearTimeout(timeoutId)
  }, [toast])

  useEffect(() => {
    function handleKeyDown(event) {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.key.toLowerCase() !== 'v') {
        return
      }

      event.preventDefault()
      void pasteFromClipboard()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    function handleClickAway(event) {
      if (!menuWrapRef.current?.contains(event.target)) {
        setActiveMenu(null)
      }

      if (!protectWrapRef.current?.contains(event.target)) {
        setIsProtectPanelOpen(false)
      }
    }

    function handleEsc(event) {
      if (event.key === 'Escape') {
        if (isProtectPanelOpen) {
          closeProtectPanel()
          return
        }

        if (activeModeGuide) {
          setActiveModeGuide(null)
          return
        }

        if (activeLegalDoc) {
          setActiveLegalDoc(null)
          return
        }

        setActiveMenu(null)
      }
    }

    window.addEventListener('mousedown', handleClickAway)
    window.addEventListener('keydown', handleEsc)

    return () => {
      window.removeEventListener('mousedown', handleClickAway)
      window.removeEventListener('keydown', handleEsc)
    }
  }, [activeLegalDoc, activeModeGuide, isProtectPanelOpen])

  function openLegalDoc(docType) {
    setActiveMenu(null)
    setActiveLegalDoc(docType)
  }

  function closeLegalDoc() {
    setActiveLegalDoc(null)
  }

  function openModeGuide(modeId = mode) {
    setActiveModeGuide(modeId)
  }

  function closeModeGuide() {
    setActiveModeGuide(null)
  }

  function syncInputSelection() {
    const inputElement = inputRef.current

    setInputSelection({
      start: inputElement?.selectionStart ?? 0,
      end: inputElement?.selectionEnd ?? 0,
    })
  }

  function toggleProtectPanel() {
    syncInputSelection()
    setIsProtectPanelOpen((current) => !current)
  }

  function closeProtectPanel() {
    setIsProtectPanelOpen(false)
  }

  function createRecoverSnapshot() {
    return {
      input,
      mode,
      sourcePreset,
      destinationPreset,
      protectedRegions,
      cleaningOptions,
      customRules,
      sourceMemory,
      projectBoards,
      activeProjectBoardId,
      history,
    }
  }

  async function pasteFromClipboard() {
    try {
      setIsPasting(true)
      const pastedText = await navigator.clipboard.readText()

      if (!pastedText) {
        setToast('Clipboard is empty.')
        setLastAction('Clipboard is empty.')
        return
      }

      startTransition(() => {
        setInput(pastedText)
        setProtectedRegions([])
      })
      setToast('Pasted from clipboard.')
      setLastAction('Pasted from clipboard.')
    } catch {
      setToast('Clipboard access was blocked by the browser.')
      setLastAction('Clipboard access was blocked by the browser.')
    } finally {
      setIsPasting(false)
    }
  }

  async function handleClean() {
    if (!workspaceResult.cleanedText) {
      const message = input.trim()
        ? 'No cleaned output yet. Adjust the text or rules and try again.'
        : 'Paste or type text before cleaning.'
      setToast(message)
      setLastAction(message)
      return
    }

    setIsCleaning(true)
    setDisplayedResult(workspaceResult)

    try {
      await navigator.clipboard.writeText(workspaceResult.cleanedText)
      const message = livePreviewEnabled
        ? 'Cleaned text copied to clipboard.'
        : 'Output refreshed and copied to clipboard.'
      const destinationMessage =
        destinationPreset !== DEFAULT_DESTINATION_PRESET ? ` ${currentDestinationPresetDefinition.label} finish included.` : ''
      setToast(`${message}${destinationMessage}`)
      setLastAction(`${message}${destinationMessage}`)
    } catch {
      setToast('Unable to copy output.')
      setLastAction('Unable to copy output.')
    } finally {
      setIsCleaning(false)
    }
  }

  function handleToggleRule(ruleKey) {
    setCleaningOptions((current) => ({
      ...current,
      [ruleKey]: !current[ruleKey],
    }))
  }

  function handleToggleModeOption(optionKey) {
    setCleaningOptions((current) => toggleModeOption(current, optionKey))
  }

  function handleToggleUrlRules() {
    const nextValue = !stripUrlsEnabled
    setCleaningOptions((current) => ({
      ...current,
      stripTrackingParams: nextValue,
      unwrapRedirects: nextValue,
      decodeReadableUrls: nextValue,
    }))
  }

  function setAllRules(nextValue) {
    const allRuleState = Object.fromEntries(CLEANING_RULES.map((rule) => [rule.key, nextValue]))
    setCleaningOptions((current) => ({ ...current, ...allRuleState }))
  }

  function handleModeChange(nextMode) {
    if (nextMode === mode) {
      return
    }

    const nextModeDefinition = getModeDefinition(nextMode)
    const nextModeLabel = getModeLabel(nextMode, nextModeDefinition.label)

    startTransition(() => {
      setCleaningOptions((current) => syncCleaningOptionsForModeChange(current, mode, nextMode))
      setMode(nextMode)
    })

    setToast(`Switched to ${nextModeLabel} mode.`)
    setLastAction(`Switched to ${nextModeLabel} mode.`)
  }

  function handleToggleLivePreview() {
    setLivePreviewEnabled((current) => {
      const next = !current

      if (next) {
        setDisplayedResult(workspaceResult)
        setToast('Live preview is active. Changes flow into the output automatically while you type.')
        setLastAction('Live preview activated.')
      } else {
        setToast('Live preview paused. Press Clean to refresh output.')
        setLastAction('Live preview paused.')
      }

      return next
    })
  }

  function handleSourcePresetChange(nextSourcePreset) {
    if (nextSourcePreset === sourcePreset) {
      return
    }

    const nextSourcePresetDefinition = getSourcePresetDefinition(nextSourcePreset)
    const rememberedSource = sourceMemory[nextSourcePreset]
    const nextMode = rememberedSource?.preferredMode || nextSourcePresetDefinition.suggestedMode || mode
    const nextDestination = rememberedSource?.preferredDestination || destinationPreset
    const rememberedModeChanged = nextMode !== mode
    const rememberedDestinationChanged = nextDestination !== destinationPreset

    setRecoverState(createRecoverSnapshot())
    startTransition(() => {
      setSourcePreset(nextSourcePreset)
      setMode(nextMode)
      setDestinationPreset(nextDestination)
    })

    if (nextSourcePreset === DEFAULT_SOURCE_PRESET) {
      setToast('Source preset cleared.')
      setLastAction('Source preset cleared.')
      return
    }

    const nextModeLabel = getModeLabel(nextMode, getModeDefinition(nextMode).label)
    const nextDestinationLabel = getDestinationPresetDefinition(nextDestination).label

    if (rememberedSource) {
      const rememberedParts = [nextSourcePresetDefinition.label, `mode: ${nextModeLabel}`]

      if (rememberedDestinationChanged || nextDestination !== DEFAULT_DESTINATION_PRESET) {
        rememberedParts.push(`destination: ${nextDestinationLabel}`)
      }

      setToast(`Restored saved ${rememberedParts.join(', ')}.`)
      setLastAction(`${nextSourcePresetDefinition.label} source memory restored.`)
      return
    }

    if (rememberedModeChanged) {
      setToast(`${nextSourcePresetDefinition.label} preset is active. Switched to ${nextModeLabel} mode.`)
      setLastAction(`${nextSourcePresetDefinition.label} preset selected.`)
      return
    }

    setToast(`${nextSourcePresetDefinition.label} preset is active.`)
    setLastAction(`${nextSourcePresetDefinition.label} preset selected.`)
  }

  function handleDestinationPresetChange(nextDestinationPreset) {
    if (nextDestinationPreset === destinationPreset) {
      return
    }

    const nextDestinationDefinition = getDestinationPresetDefinition(nextDestinationPreset)

    setRecoverState(createRecoverSnapshot())
    setDestinationPreset(nextDestinationPreset)
    setToast(
      nextDestinationPreset === DEFAULT_DESTINATION_PRESET
        ? 'Destination preset cleared.'
        : `${nextDestinationDefinition.label} destination is active.`
    )
    setLastAction(
      nextDestinationPreset === DEFAULT_DESTINATION_PRESET
        ? 'Destination preset cleared.'
        : `${nextDestinationDefinition.label} destination selected.`
    )
  }

  function handleClearSourceMemory(sourcePresetId = sourcePreset) {
    if (!sourcePresetId || sourcePresetId === DEFAULT_SOURCE_PRESET || !sourceMemory[sourcePresetId]) {
      setToast('No saved source memory for this preset.')
      setLastAction('No source memory to clear.')
      return
    }

    const label = getSourcePresetDefinition(sourcePresetId).label

    setRecoverState(createRecoverSnapshot())
    setSourceMemory((current) => {
      const nextMemory = { ...current }
      delete nextMemory[sourcePresetId]
      return nextMemory
    })
    setToast(`${label} source memory cleared.`)
    setLastAction(`${label} source memory cleared.`)
  }

  function handleProtectSelection(regionType) {
    const selectionStart = inputSelection.start
    const selectionEnd = inputSelection.end

    if (selectionStart === selectionEnd) {
      setToast('Select text in Raw Input before adding a protection region.')
      setLastAction('Protected region was not added.')
      return
    }

    const overlapsExistingRegion = protectedRegions.some(
      (region) => selectionStart < region.end && selectionEnd > region.start
    )

    if (overlapsExistingRegion) {
      setToast('That selection overlaps an existing protected region. Clear it first or choose a different range.')
      setLastAction('Protected region was not added.')
      return
    }

    const selectedText = input.slice(selectionStart, selectionEnd)
    const nextRegion = {
      id: createRuleId(),
      type: regionType,
      start: selectionStart,
      end: selectionEnd,
    }

    setRecoverState(createRecoverSnapshot())
    setProtectedRegions((current) => [...current, nextRegion].sort((left, right) => left.start - right.start))
    closeProtectPanel()
    window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(selectionStart, selectionStart + selectedText.length)
    })
    setToast('Protected region added.')
    setLastAction('Protected region added.')
  }

  function handleClearProtectedRegions() {
    if (protectedRegions.length === 0) {
      setToast('No protected regions are active.')
      setLastAction('No protected regions to clear.')
      return
    }

    setRecoverState(createRecoverSnapshot())
    setProtectedRegions([])
    closeProtectPanel()
    setToast('Protected regions removed.')
    setLastAction('Protected regions removed.')
  }

  function handleInputChange(nextValue) {
    const regionUpdate = updateProtectedRegionsForInputChange(input, nextValue, protectedRegions)

    startTransition(() => {
      setInput(nextValue)
      setProtectedRegions(regionUpdate.regions)
    })

    if (regionUpdate.removedRegions > 0) {
      const message =
        regionUpdate.removedRegions === 1
          ? '1 protected region was cleared because that text was edited.'
          : `${regionUpdate.removedRegions} protected regions were cleared because that text was edited.`
      setToast(message)
      setLastAction('Protected regions updated after edit.')
    }
  }

  function handleLoadSample() {
    setRecoverState(createRecoverSnapshot())
    const sample = getModeDefinition(mode).sample
    startTransition(() => {
      setInput(sample)
      setProtectedRegions([])
    })
    setToast('Sample loaded for current mode.')
    setLastAction('Sample loaded for current mode.')
    setActiveMenu(null)
  }

  function toggleMenu(menuName) {
    setActiveMenu((current) => (current === menuName ? null : menuName))
  }

  function handleRestoreHistory(entry) {
    setRecoverState(createRecoverSnapshot())
    startTransition(() => {
      setInput(entry.input)
      setMode(entry.mode || DEFAULT_MODE)
      setSourcePreset(entry.sourcePreset || DEFAULT_SOURCE_PRESET)
      setDestinationPreset(entry.destinationPreset || DEFAULT_DESTINATION_PRESET)
      setProtectedRegions(entry.protectedRegions ?? [])
    })
    setToast('History entry restored.')
    setLastAction('History entry restored.')
    setActiveMenu(null)
  }

  function handleResetSettings() {
    setRecoverState(createRecoverSnapshot())
    setCleaningOptions(getDefaultCleaningOptions(mode))
    setSourcePreset(DEFAULT_SOURCE_PRESET)
    setDestinationPreset(DEFAULT_DESTINATION_PRESET)
    setSourceMemory({})
    setToast('Settings reset to default.')
    setLastAction('Settings reset to default.')
    setActiveMenu(null)
  }

  function handleResetCustomRules() {
    setRecoverState(createRecoverSnapshot())
    setCustomRules([])
    setToast('Custom rules cleared.')
    setLastAction('Custom rules cleared.')
  }

  function handleClearLocalData() {
    setRecoverState(createRecoverSnapshot())
    clearHistory()
    setCleaningOptions(getDefaultCleaningOptions(mode))
    setSourcePreset(DEFAULT_SOURCE_PRESET)
    setDestinationPreset(DEFAULT_DESTINATION_PRESET)
    setCustomRules([])
    setSourceMemory({})
    setProjectBoards([])
    setActiveProjectBoardId(null)
    setToast('Local workspace data cleared.')
    setLastAction('Local workspace data cleared.')
    setActiveMenu(null)
  }

  function handleExportHistory(format) {
    if (isSavingHistory) {
      setToast('History is still saving locally. Try export again in a moment.')
      setLastAction('History export is waiting for local save.')
      return
    }

    setExportingHistoryFormat(format)
    const exported = exportHistory(history, format)

    if (!exported) {
      setToast('Nothing to export yet.')
      setLastAction('Export skipped: history is empty.')
      window.setTimeout(() => setExportingHistoryFormat(null), 0)
      return
    }

    const label = format === 'csv' ? 'CSV' : 'TXT'
    setToast(`History exported as ${label}.`)
    setLastAction(`History exported as ${label}.`)
    setActiveMenu(null)
    window.setTimeout(() => setExportingHistoryFormat(null), 700)
  }

  function handleUndoLastChange() {
    if (!recoverState) {
      return
    }

    startTransition(() => {
      setInput(recoverState.input)
      setMode(recoverState.mode)
      setSourcePreset(recoverState.sourcePreset ?? DEFAULT_SOURCE_PRESET)
      setDestinationPreset(recoverState.destinationPreset ?? DEFAULT_DESTINATION_PRESET)
      setProtectedRegions(recoverState.protectedRegions ?? [])
      setCleaningOptions(recoverState.cleaningOptions)
      setCustomRules(recoverState.customRules ?? [])
      setSourceMemory(recoverState.sourceMemory ?? {})
      setProjectBoards(recoverState.projectBoards ?? [])
      setActiveProjectBoardId(recoverState.activeProjectBoardId ?? null)
      setHistory(recoverState.history)
    })

    setRecoverState(null)
    setToast('Last change was undone.')
    setLastAction('Last change was undone.')
    setActiveMenu(null)
  }

  async function handleInstallPwa() {
    if (!deferredInstallPrompt) {
      setToast('Install prompt is not available yet.')
      setLastAction('Install prompt unavailable.')
      return
    }

    deferredInstallPrompt.prompt()
    const result = await deferredInstallPrompt.userChoice

    if (result.outcome === 'accepted') {
      setLastAction('Install prompt accepted.')
    } else {
      setLastAction('Install prompt dismissed.')
    }

    setDeferredInstallPrompt(null)
  }

  function handleExportSettingsBackup() {
    const backupText = serializeSettingsBackup({
      cleaningOptions,
      sourcePreset,
      destinationPreset,
      customRules,
      sourceMemory,
    })
    const blob = new Blob([backupText], { type: 'application/json;charset=utf-8' })
    const objectUrl = URL.createObjectURL(blob)
    const timestamp = new Date().toISOString().slice(0, 19).replaceAll(':', '-')
    const link = document.createElement('a')

    link.href = objectUrl
    link.download = `pasteclean-settings-${timestamp}.json`
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)

    setToast('Settings backup exported.')
    setLastAction('Settings backup exported.')
    setActiveMenu(null)
  }

  function handleImportSettingsBackup() {
    settingsImportRef.current?.click()
  }

  async function handleSettingsFileSelected(event) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    try {
      const rawText = await file.text()
      const imported = parseSettingsBackup(rawText, getDefaultCleaningOptions(mode))

      setRecoverState(createRecoverSnapshot())
      setCleaningOptions(imported.cleaningOptions)
      setSourcePreset(imported.sourcePreset || DEFAULT_SOURCE_PRESET)
      setDestinationPreset(imported.destinationPreset || DEFAULT_DESTINATION_PRESET)
      setCustomRules(
        imported.customRules.map((rule) => ({
          id: rule.id || createRuleId(),
          find: rule.find,
          replace: rule.replace,
          enabled: rule.enabled,
        }))
      )
      setSourceMemory(imported.sourceMemory ?? {})

      setToast('Settings backup imported.')
      setLastAction('Settings backup imported.')
      setActiveMenu(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Import failed.'
      setToast(message)
      setLastAction('Settings backup import failed.')
    } finally {
      event.target.value = ''
    }
  }

  function handleCreateProjectBoard() {
    setRecoverState(createRecoverSnapshot())
    const nextBoard = createProjectBoard(draftBoardName, projectBoards.length)

    setProjectBoards((current) => [nextBoard, ...current])
    setActiveProjectBoardId(nextBoard.id)
    setDraftBoardName('')
    setToast(`${nextBoard.name} created locally.`)
    setLastAction(`${nextBoard.name} created.`)
  }

  function handleSaveToProjectBoard() {
    if (!input.trim() && !workspaceResult.cleanedText.trim()) {
      setToast('Paste or clean some text before saving to a board.')
      setLastAction('Board save skipped.')
      return
    }

    const boardId = activeProjectBoardId || createProjectBoardId()
    const activeBoard = projectBoards.find((board) => board.id === boardId)
    const boardName = activeBoard?.name || draftBoardName.trim() || buildDefaultBoardName(projectBoards.length)
    const entry = createProjectBoardEntry({
      input,
      cleanedText: workspaceResult.cleanedText,
      mode,
      modeLabel: currentModeLabel,
      sourcePreset,
      sourcePresetLabel: currentSourcePresetDefinition.label,
      destinationPreset,
      destinationPresetLabel: currentDestinationPresetDefinition.label,
      protectedRegions,
    })

    setRecoverState(createRecoverSnapshot())
    setProjectBoards((current) => {
      const nextBoards = [...current]
      const existingIndex = nextBoards.findIndex((board) => board.id === boardId)

      if (existingIndex === -1) {
        nextBoards.unshift({
          id: boardId,
          name: boardName,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          items: [entry],
        })
      } else {
        const existingBoard = nextBoards[existingIndex]

        nextBoards[existingIndex] = {
          ...existingBoard,
          updatedAt: entry.savedAt,
          items: [entry, ...(existingBoard.items ?? [])].slice(0, 12),
        }
      }

      return nextBoards
    })
    setActiveProjectBoardId(boardId)
    setDraftBoardName('')
    setToast(`${boardName} updated with the current paste.`)
    setLastAction(`${boardName} updated.`)
  }

  function handleRestoreBoardItem(item) {
    setRecoverState(createRecoverSnapshot())
    startTransition(() => {
      setInput(item.input ?? '')
      setMode(item.mode || DEFAULT_MODE)
      setSourcePreset(item.sourcePreset || DEFAULT_SOURCE_PRESET)
      setDestinationPreset(item.destinationPreset || DEFAULT_DESTINATION_PRESET)
      setProtectedRegions(item.protectedRegions ?? [])
    })
    setToast('Board item restored.')
    setLastAction('Board item restored.')
  }

  function handleAddCustomRule() {
    const findValue = draftRuleFind.trim()

    if (!findValue) {
      setToast('Find value is required.')
      setLastAction('Custom rule was not added.')
      return
    }

    setRecoverState(createRecoverSnapshot())
    setCustomRules((current) => [
      {
        id: createRuleId(),
        find: findValue,
        replace: draftRuleReplace,
        enabled: true,
      },
      ...current,
    ])
    setDraftRuleFind('')
    setDraftRuleReplace('')
    setToast('Custom rule added.')
    setLastAction('Custom rule added.')
  }

  function handleUpdateCustomRule(ruleId, field, value) {
    setRecoverState(createRecoverSnapshot())
    setCustomRules((current) =>
      current.map((rule) => (rule.id === ruleId ? { ...rule, [field]: value } : rule))
    )
  }

  function handleToggleCustomRule(ruleId) {
    setRecoverState(createRecoverSnapshot())
    setCustomRules((current) =>
      current.map((rule) => (rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule))
    )
  }

  function handleDeleteCustomRule(ruleId) {
    setRecoverState(createRecoverSnapshot())
    setCustomRules((current) => current.filter((rule) => rule.id !== ruleId))
    setToast('Custom rule deleted.')
    setLastAction('Custom rule deleted.')
  }

  function handleClearInput() {
    if (!input.trim() && !displayedOutput.trim()) {
      return
    }

    setRecoverState(createRecoverSnapshot())
    startTransition(() => {
      setInput('')
      setProtectedRegions([])
      setDisplayedResult(null)
    })
    setToast('Input cleared.')
    setLastAction('Input cleared.')
  }

  function handleToggleTheme() {
    setTheme((current) => {
      const nextTheme = current === 'dark' ? 'light' : 'dark'
      const nextThemeLabel = nextTheme === 'dark' ? 'Dark mode' : 'Light mode'

      setToast(`${nextThemeLabel} enabled.`)
      setLastAction(`${nextThemeLabel} enabled.`)

      return nextTheme
    })
  }

  const displayedOutput = displayedResult?.cleanedText ?? ''
  const inputWords = countWords(input)
  const outputWords = countWords(displayedOutput)
  const historyPreview = history.slice(0, 5)
  const diffView = useMemo(() => buildTextDiff(input, displayedOutput), [input, displayedOutput])
  const outputChangeSummary = useMemo(() => buildOutputChangeSummary(displayedResult, diffView), [displayedResult, diffView])
  const legalDoc = activeLegalDoc ? LEGAL_CONTENT[activeLegalDoc] : null
  const enabledRuleCount = CLEANING_RULES.filter((rule) => cleaningOptions[rule.key]).length
  const activeCustomRuleCount = customRules.filter((rule) => rule.enabled && rule.find).length
  const smartCleanEnabled = enabledRuleCount === CLEANING_RULES.length
  const fixQuotesEnabled = Boolean(cleaningOptions.normalizePunctuation)
  const hasServiceWorkerSupport = typeof window !== 'undefined' && 'serviceWorker' in window.navigator
  const pwaStatus = isPwaInstalled
    ? 'installed'
    : deferredInstallPrompt
      ? 'install available'
      : hasServiceWorkerSupport
        ? 'service worker active'
        : 'not supported'
  const stripUrlsEnabled =
    Boolean(cleaningOptions.stripTrackingParams) &&
    Boolean(cleaningOptions.unwrapRedirects) &&
    Boolean(cleaningOptions.decodeReadableUrls)
  const currentModeDefinition = getModeDefinition(mode)
  const currentModeLabel = getModeLabel(mode, currentModeDefinition.label)
  const currentSourcePresetDefinition = getSourcePresetDefinition(sourcePreset)
  const currentDestinationPresetDefinition = getDestinationPresetDefinition(destinationPreset)
  const currentSourceMemory = sourceMemory[sourcePreset]
  const currentSourcePresetSuggestedModeLabel =
    currentSourcePresetDefinition.suggestedMode && currentSourcePresetDefinition.suggestedMode !== mode
      ? getModeLabel(
          currentSourcePresetDefinition.suggestedMode,
          getModeDefinition(currentSourcePresetDefinition.suggestedMode).label
        )
      : ''
  const rememberedSourceModeLabel = currentSourceMemory?.preferredMode
    ? getModeLabel(currentSourceMemory.preferredMode, getModeDefinition(currentSourceMemory.preferredMode).label)
    : ''
  const rememberedDestinationLabel =
    currentSourceMemory?.preferredDestination &&
    currentSourceMemory.preferredDestination !== DEFAULT_DESTINATION_PRESET
      ? getDestinationPresetDefinition(currentSourceMemory.preferredDestination).label
      : ''
  const sourcePresetAssistText =
    sourcePreset === DEFAULT_SOURCE_PRESET
      ? 'Tell PasteClean where the text came from when you want source-specific cleanup.'
      : `${currentSourcePresetDefinition.description}${
          currentSourcePresetSuggestedModeLabel ? ` Best paired with ${currentSourcePresetSuggestedModeLabel} mode.` : ''
        }`
  const sourceMemoryAssistText =
    sourcePreset === DEFAULT_SOURCE_PRESET
      ? `${Object.keys(sourceMemory).length} saved source preference${Object.keys(sourceMemory).length === 1 ? '' : 's'} on this device.`
      : currentSourceMemory
        ? `Remembers ${rememberedSourceModeLabel || currentModeLabel}${
            rememberedDestinationLabel ? ` + ${rememberedDestinationLabel}` : ''
          } for ${currentSourcePresetDefinition.label} on this device.`
        : `No saved source memory yet. PasteClean will remember the mode and destination you use with ${currentSourcePresetDefinition.label}.`
  const destinationPresetAssistText =
    destinationPreset === DEFAULT_DESTINATION_PRESET
      ? 'Tell PasteClean where the cleaned text is going next when you want output-specific finishing.'
      : currentDestinationPresetDefinition.description
  const protectedRegionCount = countProtectedRegions(protectedRegions)
  const protectedRegionSummary = summarizeProtectedRegions(protectedRegions)
  const protectedRegionSummaryParts = [
    protectedRegionSummary.skipRegions ? `${protectedRegionSummary.skipRegions} do not clean` : null,
    protectedRegionSummary.exactRegions ? `${protectedRegionSummary.exactRegions} exact` : null,
    protectedRegionSummary.linkRegions ? `${protectedRegionSummary.linkRegions} links only` : null,
    protectedRegionSummary.codeRegions ? `${protectedRegionSummary.codeRegions} code only` : null,
  ].filter(Boolean)
  const protectedRegionAssistText =
    protectedRegionCount === 0
      ? 'Selections stay invisible in Raw Input and are tracked only in this workspace.'
      : `Active now: ${protectedRegionSummaryParts.join(', ')}. Selections stay invisible in Raw Input.`
  const selectedCharacterCount = Math.max(inputSelection.end - inputSelection.start, 0)
  const protectPanelStatus =
    selectedCharacterCount === 0
      ? 'Select text in Raw Input, then choose a protection type.'
      : `Selected ${selectedCharacterCount} characters.`
  const modeSafeToggles = getModeSafeToggles(mode)
  const modeWarnings = getModeWarnings(mode, cleaningOptions)
  const modeControlsSummary =
    modeSafeToggles.length === 0
      ? 'This mode uses the shared cleanup controls only.'
      : `${modeSafeToggles.filter((toggle) => cleaningOptions[toggle.key]).length}/${modeSafeToggles.length} safeguards on`
  const modeGuideDefinition = getModeDefinition(activeModeGuide ?? mode)
  const modeGuideLabel = getModeLabel(modeGuideDefinition.id, modeGuideDefinition.label)
  const modeGuideToggles = getModeSafeToggles(modeGuideDefinition.id)
  const hasInput = Boolean(input.trim())
  const hasHistory = history.length > 0
  const hasDisplayedOutput = Boolean(displayedOutput.trim())
  const activeProjectBoard = projectBoards.find((board) => board.id === activeProjectBoardId) ?? null
  const activeProjectBoardItems = activeProjectBoard?.items ?? []
  const boardPreviewItems = activeProjectBoardItems.slice(0, 3)
  const boardSaveDisabled = !hasInput && !hasDisplayedOutput
  const outputNeedsRefresh = hasInput && !livePreviewEnabled && displayedOutput !== workspaceResult.cleanedText
  const historyExportDisabled = !hasHistory || isSavingHistory || Boolean(exportingHistoryFormat)
  const cleanButtonLabel = isPasting ? 'Pasting...' : isCleaning ? 'Refreshing...' : outputNeedsRefresh ? 'Refresh output' : 'Clean'

  let workspaceStatus = ''

  if (isPasting) {
    workspaceStatus = 'Reading your clipboard and updating the workspace.'
  } else if (isCleaning) {
    workspaceStatus = 'Refreshing output and copying the latest result to your clipboard.'
  } else if (!hasHistory) {
    workspaceStatus = 'Your next edit or paste will appear in History after a short local save.'
  }

  let historyHint = 'Restore or export recent pastes stored only in this browser.'
  let historyEmptyTitle = 'History is empty'
  let historyEmptyBody = 'Paste something into the workspace and your recent versions will appear here.'

  if (isSavingHistory) {
    historyHint = 'Saving your latest paste locally now.'
    historyEmptyTitle = 'Saving your first history item...'
    historyEmptyBody = 'Keep typing for a moment and it will appear here automatically.'
  } else if (!hasHistory && hasInput) {
    historyHint = 'Your next edit or paste will be saved locally after a short pause.'
    historyEmptyTitle = 'First paste almost ready'
    historyEmptyBody = 'Make one more change or paste fresh text and it will show up in your recent history.'
  }

  let outputStatusTone = 'idle'
  let outputStatusTitle = livePreviewEnabled ? 'Live preview is active.' : 'Manual output is ready.'
  let outputStatusBody = livePreviewEnabled
    ? 'Changes flow into the output automatically while you type.'
    : 'Press Clean whenever you want to refresh and copy the latest result.'

  if (isPasting) {
    outputStatusTone = 'pending'
    outputStatusTitle = 'Reading from clipboard...'
    outputStatusBody = 'Your new text will populate the workspace before output updates.'
  } else if (isCleaning) {
    outputStatusTone = 'pending'
    outputStatusTitle = 'Refreshing output...'
    outputStatusBody = 'We are updating the preview and copying the latest result.'
  } else if (!hasInput) {
    outputStatusTone = 'empty'
    outputStatusTitle = 'Output will appear here'
    outputStatusBody = 'Paste or type text on the left to generate a cleaned result.'
  } else if (outputNeedsRefresh) {
    outputStatusTone = 'warn'
    outputStatusTitle = 'Preview paused'
    outputStatusBody = 'Your latest edits are ready. Press Refresh output to sync this panel.'
  }

  let outputEmptyTitle = 'Nothing to show yet'
  let outputEmptyBody = 'Paste or type text to generate cleaned output.'

  if (isPasting) {
    outputEmptyTitle = 'Reading clipboard...'
    outputEmptyBody = 'The output panel will populate as soon as your pasted text lands.'
  } else if (outputNeedsRefresh) {
    outputEmptyTitle = 'Output is waiting for refresh'
    outputEmptyBody = 'Live preview is paused, so press Refresh output to generate the latest result here.'
  }

  const outputBadgeLabel = isPasting ? 'Loading' : isCleaning ? 'Working' : outputNeedsRefresh ? 'Paused' : hasDisplayedOutput ? (livePreviewEnabled ? 'Live' : 'Ready') : 'Empty'
  const outputBadgeTone = isPasting || isCleaning ? 'pending' : outputNeedsRefresh ? 'warn' : hasDisplayedOutput ? 'ready' : 'quiet'
  const showOutputStatus = outputStatusTone === 'pending' || outputStatusTone === 'warn'

  return (
    <main className="pcShell">
      <input
        ref={settingsImportRef}
        type="file"
        accept="application/json,.json"
        className="pcHiddenInput"
        onChange={(event) => void handleSettingsFileSelected(event)}
      />

      <header className="pcTopbar">
        <div className="pcLogo">PasteClean</div>

        <nav className="pcTopTabs" aria-label="Format modes">
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`pcTopTab ${option.id === mode ? 'pcTopTabActive' : ''}`}
              onClick={() => handleModeChange(option.id)}
            >
              {getModeLabel(option.id, option.label)}
            </button>
          ))}
        </nav>

        <div className="pcTopIcons" ref={menuWrapRef}>
          <button
            type="button"
            className={`pcIconButton ${activeMenu === 'history' ? 'pcIconButtonActive' : ''}`}
            aria-label="History"
            aria-expanded={activeMenu === 'history'}
            onClick={() => toggleMenu('history')}
          >
            <History size={17} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            className={`pcIconButton ${isDarkMode ? 'pcIconButtonActive' : ''}`}
            aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-pressed={isDarkMode}
            title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={handleToggleTheme}
          >
            {isDarkMode ? <Sun size={17} strokeWidth={2.2} /> : <MoonStar size={17} strokeWidth={2.2} />}
          </button>
          <button
            type="button"
            className={`pcIconButton ${activeMenu === 'settings' ? 'pcIconButtonActive' : ''}`}
            aria-label="Settings"
            aria-expanded={activeMenu === 'settings'}
            onClick={() => toggleMenu('settings')}
          >
            <Settings size={17} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            className={`pcAvatar ${activeMenu === 'profile' ? 'pcAvatarActive' : ''}`}
            aria-label="Profile"
            aria-expanded={activeMenu === 'profile'}
            onClick={() => toggleMenu('profile')}
          >
            <UserCircle2 size={20} strokeWidth={2.1} />
          </button>

          {activeMenu === 'history' ? (
            <div className="pcMenu pcMenuHistory" role="menu" aria-label="History menu">
              <div className="pcMenuStatusRow">
                <p className="pcMenuTitle">Recent Pastes ({history.length}/{historyLimit})</p>
                <span className={`pcStatusPill pcStatusPill${isSavingHistory ? 'Pending' : hasHistory ? 'Ready' : 'Quiet'}`}>
                  {isSavingHistory ? 'Saving...' : hasHistory ? 'Local' : 'Empty'}
                </span>
              </div>
              <p className="pcMenuHint">{historyHint}</p>
              {historyPreview.length === 0 ? (
                <div className={`pcEmptyState ${isSavingHistory ? 'pcEmptyStatePending' : ''}`}>
                  <strong>{historyEmptyTitle}</strong>
                  <span>{historyEmptyBody}</span>
                </div>
              ) : (
                <div className="pcMenuList">
                  {historyPreview.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className="pcMenuItem"
                      onClick={() => handleRestoreHistory(entry)}
                    >
                      <strong>
                        {entry.modeLabel}
                        {entry.sourcePresetLabel && entry.sourcePresetLabel !== 'No preset'
                          ? ` / ${entry.sourcePresetLabel}`
                          : ''}
                        {entry.destinationPresetLabel && entry.destinationPresetLabel !== 'No destination'
                          ? ` / ${entry.destinationPresetLabel}`
                          : ''}
                        {entry.protectedRegionCount ? ` / ${entry.protectedRegionCount} locks` : ''}
                      </strong>
                      <span>{entry.input.slice(0, 44) || 'Empty paste'}</span>
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                className="pcMenuAction"
                onClick={() => handleExportHistory('txt')}
                disabled={historyExportDisabled}
              >
                {exportingHistoryFormat === 'txt'
                  ? 'Exporting history (.txt)...'
                  : isSavingHistory
                    ? 'Saving history (.txt)...'
                    : 'Export history (.txt)'}
              </button>
              <button
                type="button"
                className="pcMenuAction"
                onClick={() => handleExportHistory('csv')}
                disabled={historyExportDisabled}
              >
                {exportingHistoryFormat === 'csv'
                  ? 'Exporting history (.csv)...'
                  : isSavingHistory
                    ? 'Saving history (.csv)...'
                    : 'Export history (.csv)'}
              </button>
            </div>
          ) : null}

          {activeMenu === 'settings' ? (
            <div className="pcMenu pcMenuWide" role="menu" aria-label="Settings menu">
              <p className="pcMenuTitle">Settings ({enabledRuleCount}/{CLEANING_RULES.length} rules on)</p>

              <div className="pcMenuSection">
                <p className="pcMenuSectionTitle">Format mode</p>
                <div className="pcMenuPills">
                  {MODE_OPTIONS.map((option) => (
                    <button
                      key={`settings-${option.id}`}
                      type="button"
                      className={`pcMenuPill ${option.id === mode ? 'pcMenuPillActive' : ''}`}
                      onClick={() => handleModeChange(option.id)}
                    >
                      {getModeLabel(option.id, option.label)}
                    </button>
                  ))}
                </div>
                <p className="pcMenuHint pcMenuHintInline">
                  <strong>{currentModeLabel}:</strong> {currentModeDefinition.description}
                </p>
              </div>

              <div className="pcMenuSection">
                <p className="pcMenuSectionTitle">Source preset</p>
                <div className="pcMenuPills">
                  {SOURCE_PRESET_OPTIONS.map((preset) => (
                    <button
                      key={`source-${preset.id}`}
                      type="button"
                      className={`pcMenuPill ${preset.id === sourcePreset ? 'pcMenuPillActive' : ''}`}
                      onClick={() => handleSourcePresetChange(preset.id)}
                    >
                      {preset.shortLabel}
                    </button>
                  ))}
                </div>
                <p className="pcMenuHint pcMenuHintInline">
                  <strong>{currentSourcePresetDefinition.label}:</strong> {sourcePresetAssistText}
                </p>
                <p className="pcMenuHint pcMenuHintInline">{sourceMemoryAssistText}</p>
                {sourcePreset !== DEFAULT_SOURCE_PRESET && currentSourceMemory ? (
                  <button type="button" className="pcMenuAction" onClick={() => handleClearSourceMemory()}>
                    Forget saved source combo
                  </button>
                ) : null}
              </div>

              <div className="pcMenuSection">
                <p className="pcMenuSectionTitle">Output destination</p>
                <div className="pcMenuPills">
                  {DESTINATION_PRESET_OPTIONS.map((preset) => (
                    <button
                      key={`destination-${preset.id}`}
                      type="button"
                      className={`pcMenuPill ${preset.id === destinationPreset ? 'pcMenuPillActive' : ''}`}
                      onClick={() => handleDestinationPresetChange(preset.id)}
                    >
                      {preset.shortLabel}
                    </button>
                  ))}
                </div>
                <p className="pcMenuHint pcMenuHintInline">
                  <strong>{currentDestinationPresetDefinition.label}:</strong> {destinationPresetAssistText}
                </p>
              </div>

              <div className="pcMenuSection">
                <p className="pcMenuSectionTitle">Mode-safe controls</p>
                {modeSafeToggles.length === 0 ? (
                  <p className="pcMenuEmpty">No extra safeguards are needed for this mode.</p>
                ) : (
                  <div className="pcMenuRules">
                    {modeSafeToggles.map((toggle) => (
                      <button
                        key={toggle.key}
                        type="button"
                        className={`pcMenuRule ${cleaningOptions[toggle.key] ? 'pcMenuRuleActive' : ''}`}
                        onClick={() => handleToggleModeOption(toggle.key)}
                      >
                        <span className="pcMenuRuleText">
                          <strong>{toggle.label}</strong>
                          <small>{toggle.description}</small>
                        </span>
                        <span className={`pcToggleMark ${cleaningOptions[toggle.key] ? 'pcToggleMarkOn' : ''}`}>
                          <span className="pcToggleMarkKnob" aria-hidden="true" />
                          <span className="pcToggleMarkLabel">{cleaningOptions[toggle.key] ? 'On' : 'Off'}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {modeWarnings.length > 0 ? (
                <div className="pcMenuSection">
                  <p className="pcMenuSectionTitle">Structured text warnings</p>
                  <div className="pcMenuWarnings">
                    {modeWarnings.map((warning) => (
                      <div key={warning.title} className="pcMenuWarning">
                        <strong>{warning.title}</strong>
                        <span>{warning.body}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="pcMenuSection">
                <p className="pcMenuSectionTitle">Cleaning rules</p>
                <div className="pcMenuRules">
                  {CLEANING_RULES.map((rule) => (
                    <button
                      key={rule.key}
                      type="button"
                      className={`pcMenuRule ${cleaningOptions[rule.key] ? 'pcMenuRuleActive' : ''}`}
                      onClick={() => handleToggleRule(rule.key)}
                    >
                      <span className="pcMenuRuleText">
                        <strong>{rule.label}</strong>
                        <small>{rule.description}</small>
                      </span>
                      <span className={`pcToggleMark ${cleaningOptions[rule.key] ? 'pcToggleMarkOn' : ''}`}>
                        <span className="pcToggleMarkKnob" aria-hidden="true" />
                        <span className="pcToggleMarkLabel">{cleaningOptions[rule.key] ? 'On' : 'Off'}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pcMenuSection">
                <p className="pcMenuSectionTitle">
                  Custom find / replace ({activeCustomRuleCount}/{customRules.length} active)
                </p>
                <div className="pcCustomRuleComposer">
                  <input
                    type="text"
                    className="pcCustomRuleInput"
                    placeholder="Find text"
                    value={draftRuleFind}
                    onChange={(event) => setDraftRuleFind(event.target.value)}
                  />
                  <input
                    type="text"
                    className="pcCustomRuleInput"
                    placeholder="Replace with (optional)"
                    value={draftRuleReplace}
                    onChange={(event) => setDraftRuleReplace(event.target.value)}
                  />
                  <button type="button" className="pcMenuAction pcCustomRuleAdd" onClick={handleAddCustomRule}>
                    Add custom rule
                  </button>
                </div>

                {customRules.length === 0 ? (
                  <p className="pcMenuEmpty">No custom rules yet.</p>
                ) : (
                  <div className="pcCustomRuleList">
                    {customRules.map((rule) => (
                      <div key={rule.id} className={`pcCustomRuleItem ${rule.enabled ? 'pcCustomRuleItemOn' : ''}`}>
                        <div className="pcCustomRuleRow">
                          <input
                            type="text"
                            className="pcCustomRuleInput"
                            value={rule.find}
                            onChange={(event) => handleUpdateCustomRule(rule.id, 'find', event.target.value)}
                            placeholder="Find"
                          />
                          <input
                            type="text"
                            className="pcCustomRuleInput"
                            value={rule.replace ?? ''}
                            onChange={(event) => handleUpdateCustomRule(rule.id, 'replace', event.target.value)}
                            placeholder="Replace"
                          />
                        </div>
                        <div className="pcCustomRuleRow pcCustomRuleActions">
                          <button
                            type="button"
                            className={`pcMenuPill ${rule.enabled ? 'pcMenuPillActive' : ''}`}
                            onClick={() => handleToggleCustomRule(rule.id)}
                          >
                            {rule.enabled ? 'Enabled' : 'Disabled'}
                          </button>
                          <button
                            type="button"
                            className="pcMenuAction pcCustomRuleDelete"
                            onClick={() => handleDeleteCustomRule(rule.id)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pcMenuSection">
                <p className="pcMenuSectionTitle">Actions</p>
                <button type="button" className="pcMenuAction" onClick={handleLoadSample}>
                  Load sample text
                </button>
                <button type="button" className="pcMenuAction" onClick={handleResetSettings}>
                  Reset workspace preferences
                </button>
                <button type="button" className="pcMenuAction" onClick={handleResetCustomRules}>
                  Reset custom rules
                </button>
                <button type="button" className="pcMenuAction" onClick={handleExportSettingsBackup}>
                  Export settings backup (.json)
                </button>
                <button type="button" className="pcMenuAction" onClick={handleImportSettingsBackup}>
                  Import settings backup (.json)
                </button>
                <button type="button" className="pcMenuAction" onClick={() => void pasteFromClipboard()}>
                  Paste from clipboard
                </button>
                {recoverState ? (
                  <button type="button" className="pcMenuAction" onClick={handleUndoLastChange}>
                    Undo last change
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {activeMenu === 'profile' ? (
            <div className="pcMenu" role="menu" aria-label="Profile menu">
              <p className="pcMenuTitle">Profile</p>
              <p className="pcMenuHint">This workspace runs locally in your browser.</p>
              <button type="button" className="pcMenuAction pcMenuDanger" onClick={handleClearLocalData}>
                Clear local workspace data
              </button>
              {recoverState ? (
                <button type="button" className="pcMenuAction" onClick={handleUndoLastChange}>
                  Undo last change
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      <section className="pcMainGrid">
        <aside className="pcRail">
          <article className="pcCard">
            <p className="pcLabel">Quick Config</p>

            <div className="pcRowBetween pcLiveRow">
              <span>Live Preview</span>
              <button
                type="button"
                className={`pcSwitch ${livePreviewEnabled ? 'pcSwitchOn' : 'pcSwitchOff'}`}
                aria-label="Toggle live preview"
                aria-pressed={livePreviewEnabled}
                onClick={handleToggleLivePreview}
              >
                <span className="pcSwitchKnob" />
              </button>
            </div>

            <p className="pcQuickHint">Fast actions only. Advanced rules live in Settings.</p>

            <p className="pcSubLabel">Processing Modes</p>
            <div className="pcModeToggles">
              <button
                type="button"
                className={`pcPillToggle ${smartCleanEnabled ? 'pcPillToggleActive' : ''}`}
                onClick={() => setAllRules(!smartCleanEnabled)}
              >
                <span className="pcPillLeft">
                  <Sparkles size={16} />
                  <span>Smart Clean</span>
                </span>
                <span className="pcPillState">{smartCleanEnabled ? 'On' : 'Off'}</span>
              </button>

              <button
                type="button"
                className={`pcPillToggle ${fixQuotesEnabled ? 'pcPillToggleActive' : ''}`}
                onClick={() => handleToggleRule('normalizePunctuation')}
              >
                <span className="pcPillLeft">
                  <Quote size={16} />
                  <span>Fix Quotes</span>
                </span>
                <span className="pcPillState">{fixQuotesEnabled ? 'On' : 'Off'}</span>
              </button>

              <button
                type="button"
                className={`pcPillToggle ${stripUrlsEnabled ? 'pcPillToggleActive' : ''}`}
                onClick={handleToggleUrlRules}
              >
                <span className="pcPillLeft">
                  <Link2Off size={16} />
                  <span>Strip URLs</span>
                </span>
                <span className="pcPillState">{stripUrlsEnabled ? 'On' : 'Off'}</span>
              </button>
            </div>

            <p className="pcSubLabel">Source Preset</p>
            <p className="pcQuickHint">Tell PasteClean where this copy came from.</p>
            <div className="pcSourcePresetGrid">
              {SOURCE_PRESET_OPTIONS.map((preset) => (
                <button
                  key={`quick-source-${preset.id}`}
                  type="button"
                  className={`pcSourcePresetButton ${preset.id === sourcePreset ? 'pcSourcePresetButtonActive' : ''}`}
                  onClick={() => handleSourcePresetChange(preset.id)}
                >
                  <strong>{preset.shortLabel}</strong>
                  <span>{preset.id === DEFAULT_SOURCE_PRESET ? 'Mode-only cleanup' : preset.label}</span>
                </button>
              ))}
            </div>
            <p className="pcSourcePresetAssist">{sourcePresetAssistText}</p>
            <p className="pcSourcePresetAssist">{sourceMemoryAssistText}</p>

            <p className="pcSubLabel">Output Destination</p>
            <p className="pcQuickHint">Tell PasteClean where the cleaned text is going next.</p>
            <div className="pcSourcePresetGrid">
              {DESTINATION_PRESET_OPTIONS.map((preset) => (
                <button
                  key={`quick-destination-${preset.id}`}
                  type="button"
                  className={`pcSourcePresetButton ${preset.id === destinationPreset ? 'pcSourcePresetButtonActive' : ''}`}
                  onClick={() => handleDestinationPresetChange(preset.id)}
                >
                  <strong>{preset.shortLabel}</strong>
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>
            <p className="pcSourcePresetAssist">{destinationPresetAssistText}</p>
          </article>

          <article className="pcCard">
            <p className="pcLabel">Stats</p>
            <div className="pcStatsGrid">
              <div>
                <strong>{input.length.toLocaleString()}</strong>
                <span>Characters</span>
              </div>
              <div>
                <strong>{inputWords.toLocaleString()}</strong>
                <span>Words</span>
              </div>
              <div>
                <strong>{outputWords.toLocaleString()}</strong>
                <span>Output Words</span>
              </div>
              <div>
                <strong>{history.length.toLocaleString()}</strong>
                <span>Saved Pastes</span>
              </div>
              <div>
                <strong>{projectBoards.length.toLocaleString()}</strong>
                <span>Boards</span>
              </div>
              <div>
                <strong>{activeProjectBoardItems.length.toLocaleString()}</strong>
                <span>Active Board Items</span>
              </div>
            </div>
          </article>

          <article className="pcCard">
            <p className="pcLabel">Project Board</p>
            <p className="pcQuickHint">Keep related pastes together locally on this device.</p>
            <div className="pcBoardControls">
              <select
                className="pcBoardSelect"
                value={activeProjectBoardId ?? ''}
                onChange={(event) => setActiveProjectBoardId(event.target.value || null)}
              >
                <option value="">No board selected</option>
                {projectBoards.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.name}
                  </option>
                ))}
              </select>
              <div className="pcInlineFieldRow">
                <input
                  type="text"
                  className="pcCustomRuleInput"
                  placeholder={buildDefaultBoardName(projectBoards.length)}
                  value={draftBoardName}
                  onChange={(event) => setDraftBoardName(event.target.value)}
                />
                <button type="button" className="pcSecondaryButton" onClick={handleCreateProjectBoard}>
                  New board
                </button>
              </div>
              <button
                type="button"
                className="pcSecondaryButton pcBoardSaveButton"
                onClick={handleSaveToProjectBoard}
                disabled={boardSaveDisabled}
              >
                Save current paste
              </button>
            </div>
            {activeProjectBoard ? (
              <>
                <p className="pcSourcePresetAssist">
                  <strong>{activeProjectBoard.name}:</strong> {activeProjectBoardItems.length} saved item
                  {activeProjectBoardItems.length === 1 ? '' : 's'}.
                </p>
                {boardPreviewItems.length === 0 ? (
                  <p className="pcBoardEmpty">Save the current workspace to start this board.</p>
                ) : (
                  <div className="pcBoardList">
                    {boardPreviewItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="pcBoardItem"
                        onClick={() => handleRestoreBoardItem(item)}
                      >
                        <strong>{item.modeLabel}</strong>
                        <span>{item.input.slice(0, 56) || 'Empty paste'}</span>
                        <small>
                          {item.sourcePresetLabel !== 'No preset' ? `${item.sourcePresetLabel} / ` : ''}
                          {item.destinationPresetLabel !== 'No destination' ? `${item.destinationPresetLabel} / ` : ''}
                          {formatSavedTimestamp(item.savedAt)}
                        </small>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="pcBoardEmpty">Create a board when you want to group related pastes locally.</p>
            )}
          </article>
        </aside>

        <section className="pcWorkspace">
          <div className="pcWorkspaceTop">
            <div>
              <h1>Workspace</h1>
              <p>Paste your messy text below for a tactile cleanup.</p>
            </div>
            <div className="pcWorkspaceActions">
              <button
                type="button"
                className="pcCleanButton"
                onClick={handleClean}
                disabled={!hasInput || isPasting || isCleaning}
                aria-busy={isCleaning}
              >
                <BrushCleaning size={16} strokeWidth={2.3} aria-hidden="true" />
                <span>{cleanButtonLabel}</span>
              </button>
              <div className="pcExportActions" aria-label="History export actions">
                <button type="button" className="pcSecondaryButton" onClick={() => openModeGuide()}>
                  Mode guide
                </button>
                <button
                  type="button"
                  className="pcSecondaryButton"
                  onClick={() => handleExportHistory('txt')}
                  disabled={historyExportDisabled}
                >
                  {exportingHistoryFormat === 'txt' ? 'Exporting...' : isSavingHistory ? 'Saving...' : 'Export .txt'}
                </button>
                <button
                  type="button"
                  className="pcSecondaryButton"
                  onClick={() => handleExportHistory('csv')}
                  disabled={historyExportDisabled}
                >
                  {exportingHistoryFormat === 'csv' ? 'Exporting...' : isSavingHistory ? 'Saving...' : 'Export .csv'}
                </button>
              </div>
              {workspaceStatus ? (
                <p className="pcWorkspaceAssist" role="status" aria-live="polite">
                  {workspaceStatus}
                </p>
              ) : null}
            </div>
          </div>

          <div className="pcEditors">
            <article className="pcEditorCard">
              <div className="pcEditorCardTop">
                <p className="pcEditorLabel">Raw Input</p>
                <div className="pcEditorCardActions">
                  <div className="pcProtectWrap" ref={protectWrapRef}>
                    <button
                      type="button"
                      className={`pcEditorActionButton ${isProtectPanelOpen ? 'pcEditorActionButtonActive' : ''}`}
                      aria-expanded={isProtectPanelOpen}
                      aria-controls="pcProtectPanel"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={toggleProtectPanel}
                    >
                      Protect
                    </button>
                    {isProtectPanelOpen ? (
                      <section
                        id="pcProtectPanel"
                        className="pcProtectPopover"
                        role="dialog"
                        aria-modal="false"
                        aria-labelledby="pcProtectPanelTitle"
                      >
                        <div className="pcProtectToolbarTop">
                          <p id="pcProtectPanelTitle" className="pcProtectLabel">
                            Protect Selection
                          </p>
                          <button
                            type="button"
                            className="pcProtectClear"
                            onClick={handleClearProtectedRegions}
                            disabled={protectedRegionCount === 0}
                          >
                            Clear all
                          </button>
                        </div>
                        <p className="pcProtectHint">{protectPanelStatus}</p>
                        <div className="pcProtectActions">
                          {PROTECTED_REGION_ACTIONS.map((action) => (
                            <button
                              key={action.id}
                              type="button"
                              className="pcProtectAction"
                              onClick={() => handleProtectSelection(action.id)}
                            >
                              <strong>{action.label}</strong>
                              <span>{action.description}</span>
                            </button>
                          ))}
                        </div>
                        <p className="pcProtectMeta">{protectedRegionAssistText}</p>
                      </section>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="pcEditorIconButton"
                    aria-label="Paste from clipboard"
                    title="Paste from clipboard"
                    onClick={() => void pasteFromClipboard()}
                    disabled={isPasting}
                  >
                    <ClipboardPaste size={16} strokeWidth={2.2} />
                  </button>
                  <button
                    type="button"
                    className="pcEditorIconButton"
                    aria-label="Clear input"
                    title="Clear input"
                    onClick={handleClearInput}
                    disabled={!hasInput && !hasDisplayedOutput}
                  >
                    <Trash2 size={16} strokeWidth={2.2} />
                  </button>
                </div>
              </div>
              <textarea
                ref={inputRef}
                className="pcEditor"
                value={input}
                onChange={(event) => handleInputChange(event.target.value)}
                onSelect={syncInputSelection}
                onKeyUp={syncInputSelection}
                onClick={syncInputSelection}
                placeholder="Start typing or paste content here..."
                spellCheck={false}
              />
              <p className="pcEditorAssist">{protectedRegionCount} protection{protectedRegionCount === 1 ? '' : 's'} active. {protectedRegionAssistText}</p>
            </article>

            <article className="pcEditorCard pcEditorCardPreview">
              <div className="pcEditorCardTop">
                <p className="pcEditorLabel pcEditorLabelLive">Live Preview</p>
                <span className={`pcStatusPill pcStatusPill${outputBadgeTone.charAt(0).toUpperCase()}${outputBadgeTone.slice(1)}`}>
                  {outputBadgeLabel}
                </span>
              </div>
              {showOutputStatus ? (
                <div
                  className={`pcOutputState pcOutputState${outputStatusTone.charAt(0).toUpperCase()}${outputStatusTone.slice(1)}`}
                  role="status"
                  aria-live="polite"
                >
                  <strong>{outputStatusTitle}</strong>
                  <span>{outputStatusBody}</span>
                </div>
              ) : null}
              {outputChangeSummary.changed ? (
                <div
                  className={`pcOutputChanges ${outputChangeSummary.changed ? 'pcOutputChangesActive' : 'pcOutputChangesQuiet'}`}
                  role="status"
                  aria-live="polite"
                >
                  <div className="pcOutputChangesTop">
                    <strong>{outputChangeSummary.headline}</strong>
                    {outputChangeSummary.detail ? <span>{outputChangeSummary.detail}</span> : null}
                  </div>
                  <div className="pcOutputChangeList">
                    {outputChangeSummary.items.map((item) => (
                      <span key={item} className="pcOutputChangeChip">
                        {item}
                      </span>
                    ))}
                  </div>
                  {outputChangeSummary.note ? <p className="pcOutputChangesNote">{outputChangeSummary.note}</p> : null}
                </div>
              ) : null}
              {hasDisplayedOutput ? (
                <textarea
                  className="pcEditor pcEditorPreview"
                  value={displayedOutput}
                  readOnly
                  aria-busy={isPasting || isCleaning}
                />
              ) : (
                <div className="pcOutputEmptyState" role="status" aria-live="polite">
                  <strong>{outputEmptyTitle}</strong>
                  <p>{outputEmptyBody}</p>
                </div>
              )}
            </article>
          </div>

          <article className="pcEditorCard pcDiffCard" aria-live="polite">
            <div className="pcDiffHeader">
              <p className="pcEditorLabel">Diff View</p>
              <p className="pcDiffSummary">
                {diffView.stats.changed
                  ? `${diffView.stats.removedCount} removals, ${diffView.stats.addedCount} additions`
                  : 'No differences'}
              </p>
            </div>

            <div className="pcDiffGrid">
              <section className="pcDiffPane" aria-label="Before cleaning">
                <h2 className="pcDiffPaneTitle">Before</h2>
                <div className="pcDiffText" role="textbox" aria-readonly="true">
                  {diffView.beforeSegments.length === 0 ? (
                    <span className="pcDiffSegment pcDiffSegmentMuted">No input text.</span>
                  ) : (
                    diffView.beforeSegments.map((segment, index) => (
                      <span
                        key={`before-${index}`}
                        className={`pcDiffSegment ${segment.type === 'removed' ? 'pcDiffSegmentRemoved' : ''}`}
                      >
                        {segment.value}
                      </span>
                    ))
                  )}
                </div>
              </section>

              <section className="pcDiffPane" aria-label="After cleaning">
                <h2 className="pcDiffPaneTitle">After</h2>
                <div className="pcDiffText" role="textbox" aria-readonly="true">
                  {diffView.afterSegments.length === 0 ? (
                    <span className="pcDiffSegment pcDiffSegmentMuted">No output text.</span>
                  ) : (
                    diffView.afterSegments.map((segment, index) => (
                      <span
                        key={`after-${index}`}
                        className={`pcDiffSegment ${segment.type === 'added' ? 'pcDiffSegmentAdded' : ''}`}
                      >
                        {segment.value}
                      </span>
                    ))
                  )}
                </div>
              </section>
            </div>
          </article>
        </section>
      </section>

      <footer className="pcFooter">
        <span>(c) 2026 PasteClean</span>
        <span>Made by JoshCO</span>
        <span className="pcFooterAction">Last action: {lastAction}</span>
        <span>{toast || (isPasting ? 'Pasting...' : 'Local storage: active')}</span>
        <span>PWA status: {pwaStatus}</span>
        {deferredInstallPrompt && !isPwaInstalled ? (
          <button type="button" className="pcFooterLink" onClick={() => void handleInstallPwa()}>
            Install App
          </button>
        ) : null}
        <button type="button" className="pcFooterLink" onClick={() => openLegalDoc('privacy')}>
          Privacy
        </button>
        <button type="button" className="pcFooterLink" onClick={() => openLegalDoc('terms')}>
          Terms
        </button>
      </footer>

      {toast ? (
        <div className="pcToast" role="status" aria-live="polite" aria-atomic="true">
          {toast}
        </div>
      ) : null}

      {activeModeGuide ? (
        <div
          className="pcLegalBackdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeModeGuide()
            }
          }}
        >
          <section className="pcLegalModal pcModeGuideModal" role="dialog" aria-modal="true" aria-labelledby="pcModeGuideTitle">
            <div className="pcLegalTop">
              <h2 id="pcModeGuideTitle">What These Modes Do</h2>
              <button type="button" className="pcLegalClose" onClick={closeModeGuide}>
                Close
              </button>
            </div>
            <p className="pcLegalUpdated">
              Active tab: {modeGuideLabel}
              {modeGuideDefinition.id === mode ? ' • current mode' : ''}
            </p>

            <div className="pcModeGuideTabs" role="tablist" aria-label="Mode guide tabs">
              {MODE_OPTIONS.map((option) => (
                <button
                  key={`guide-${option.id}`}
                  type="button"
                  role="tab"
                  aria-selected={option.id === modeGuideDefinition.id}
                  className={`pcMenuPill ${option.id === modeGuideDefinition.id ? 'pcMenuPillActive' : ''}`}
                  onClick={() => setActiveModeGuide(option.id)}
                >
                  {getModeLabel(option.id, option.label)}
                </button>
              ))}
            </div>

            <div className="pcModeGuideBody">
              <section className="pcModeGuideSection">
                <p className="pcEditorLabel">Overview</p>
                <h3>{modeGuideLabel}</h3>
                <p>{modeGuideDefinition.description}</p>
              </section>

              <section className="pcModeGuideSection">
                <p className="pcEditorLabel">What it does</p>
                <div className="pcModeRuleList">
                  {modeGuideDefinition.rules.map((rule) => (
                    <span key={rule} className="pcModeRuleChip">
                      {rule}
                    </span>
                  ))}
                </div>
              </section>

              <section className="pcModeGuideSection">
                <p className="pcEditorLabel">Available safeguards</p>
                {modeGuideToggles.length === 0 ? (
                  <p className="pcModePanelEmpty">This mode mainly relies on the shared cleanup controls.</p>
                ) : (
                  <div className="pcModeGuideSafeguards">
                    {modeGuideToggles.map((toggle) => (
                      <div key={toggle.key} className="pcModeGuideCard">
                        <strong>{toggle.label}</strong>
                        <span>{toggle.description}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </section>
        </div>
      ) : null}

      {legalDoc ? (
        <div
          className="pcLegalBackdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeLegalDoc()
            }
          }}
        >
          <section className="pcLegalModal" role="dialog" aria-modal="true" aria-labelledby="pcLegalTitle">
            <div className="pcLegalTop">
              <h2 id="pcLegalTitle">{legalDoc.title}</h2>
              <button type="button" className="pcLegalClose" onClick={closeLegalDoc}>
                Close
              </button>
            </div>
            <p className="pcLegalUpdated">Last updated: {legalDoc.updatedAt}</p>

            <div className="pcLegalBody">
              {legalDoc.sections.map((section) => (
                <article key={section.heading} className="pcLegalSection">
                  <h3>{section.heading}</h3>
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}

export default App
