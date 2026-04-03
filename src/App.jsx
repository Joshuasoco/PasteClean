import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { BrushCleaning, History, Link2Off, Quote, Settings, Sparkles, UserCircle2 } from 'lucide-react'
import {
  CLEANING_RULES,
  cleanText,
  getDefaultCleaningOptions,
} from './features/cleaner/cleanText'
import { getModeDefinition, getModes } from './features/cleaner/modes'
import { usePasteHistory } from './hooks/usePasteHistory'
import { useStoredState } from './hooks/useStoredState'
import { buildTextDiff } from './utils/buildTextDiff'
import { exportHistory } from './utils/exportHistory'
import { parseSettingsBackup, serializeSettingsBackup } from './utils/settingsBackup'
import { STORAGE_KEYS } from './utils/storageKeys'

const MODE_OPTIONS = getModes()
const DEFAULT_MODE = 'plain'
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

function App() {
  const [mode, setMode] = useState(DEFAULT_MODE)
  const [input, setInput] = useState(() => getModeDefinition(DEFAULT_MODE).sample)
  const [cleaningOptions, setCleaningOptions] = useState(() => getDefaultCleaningOptions())
  const [customRules, setCustomRules] = useStoredState(STORAGE_KEYS.customRules, [])
  const [livePreviewEnabled, setLivePreviewEnabled] = useState(true)
  const [toast, setToast] = useState('')
  const [lastAction, setLastAction] = useState('Live preview is active.')
  const [isCleaning, setIsCleaning] = useState(false)
  const [isPasting, setIsPasting] = useState(false)
  const [exportingHistoryFormat, setExportingHistoryFormat] = useState(null)
  const [activeMenu, setActiveMenu] = useState(null)
  const [activeLegalDoc, setActiveLegalDoc] = useState(null)
  const [recoverState, setRecoverState] = useState(null)
  const [displayedOutput, setDisplayedOutput] = useState('')
  const [draftRuleFind, setDraftRuleFind] = useState('')
  const [draftRuleReplace, setDraftRuleReplace] = useState('')
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null)
  const [isPwaInstalled, setIsPwaInstalled] = useState(false)
  const menuWrapRef = useRef(null)
  const settingsImportRef = useRef(null)

  const deferredInput = useDeferredValue(input)
  const deferredMode = useDeferredValue(mode)

  const result = useMemo(
    () => cleanText(deferredInput, deferredMode, { ...cleaningOptions, customRules }),
    [cleaningOptions, customRules, deferredInput, deferredMode]
  )

  useEffect(() => {
    if (!livePreviewEnabled) {
      return
    }

    setDisplayedOutput(result.cleanedText)
  }, [livePreviewEnabled, result.cleanedText])

  const { history, setHistory, clearHistory, historyLimit, isSavingHistory } = usePasteHistory({
    input,
    result,
    mode,
    customRuleSummary: result.customRuleSummary,
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
    }

    function handleEsc(event) {
      if (event.key === 'Escape') {
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
  }, [activeLegalDoc])

  function openLegalDoc(docType) {
    setActiveMenu(null)
    setActiveLegalDoc(docType)
  }

  function closeLegalDoc() {
    setActiveLegalDoc(null)
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
    if (!result.cleanedText) {
      const message = input.trim()
        ? 'No cleaned output yet. Adjust the text or rules and try again.'
        : 'Paste or type text before cleaning.'
      setToast(message)
      setLastAction(message)
      return
    }

    setIsCleaning(true)
    setDisplayedOutput(result.cleanedText)

    try {
      await navigator.clipboard.writeText(result.cleanedText)
      const message = livePreviewEnabled
        ? 'Cleaned text copied to clipboard.'
        : 'Output refreshed and copied to clipboard.'
      setToast(message)
      setLastAction(message)
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

  function setAllRules(nextValue) {
    const allRuleState = Object.fromEntries(CLEANING_RULES.map((rule) => [rule.key, nextValue]))
    setCleaningOptions((current) => ({ ...current, ...allRuleState }))
  }

  function handleModeChange(nextMode) {
    startTransition(() => {
      setMode(nextMode)
    })
  }

  function handleToggleLivePreview() {
    setLivePreviewEnabled((current) => {
      const next = !current

      if (next) {
        setDisplayedOutput(result.cleanedText)
        setToast('Live preview is active. Changes flow into the output automatically while you type.')
        setLastAction('Live preview activated.')
      } else {
        setToast('Live preview paused. Press Clean to refresh output.')
        setLastAction('Live preview paused.')
      }

      return next
    })
  }

  function handleLoadSample() {
    setRecoverState({ input, mode, cleaningOptions, customRules, history })
    const sample = getModeDefinition(mode).sample
    startTransition(() => {
      setInput(sample)
    })
    setToast('Sample loaded for current mode.')
    setLastAction('Sample loaded for current mode.')
    setActiveMenu(null)
  }

  function toggleMenu(menuName) {
    setActiveMenu((current) => (current === menuName ? null : menuName))
  }

  function handleRestoreHistory(entry) {
    setRecoverState({ input, mode, cleaningOptions, customRules, history })
    startTransition(() => {
      setInput(entry.input)
      setMode(entry.mode || DEFAULT_MODE)
    })
    setToast('History entry restored.')
    setLastAction('History entry restored.')
    setActiveMenu(null)
  }

  function handleResetSettings() {
    setRecoverState({ input, mode, cleaningOptions, customRules, history })
    setCleaningOptions(getDefaultCleaningOptions())
    setToast('Settings reset to default.')
    setLastAction('Settings reset to default.')
    setActiveMenu(null)
  }

  function handleResetCustomRules() {
    setRecoverState({ input, mode, cleaningOptions, customRules, history })
    setCustomRules([])
    setToast('Custom rules cleared.')
    setLastAction('Custom rules cleared.')
  }

  function handleClearLocalData() {
    setRecoverState({ input, mode, cleaningOptions, customRules, history })
    clearHistory()
    setCleaningOptions(getDefaultCleaningOptions())
    setCustomRules([])
    setToast('Local history cleared.')
    setLastAction('Local history cleared.')
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
      setCleaningOptions(recoverState.cleaningOptions)
      setCustomRules(recoverState.customRules ?? [])
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
    const backupText = serializeSettingsBackup({ cleaningOptions, customRules })
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
      const imported = parseSettingsBackup(rawText, getDefaultCleaningOptions())

      setRecoverState({ input, mode, cleaningOptions, customRules, history })
      setCleaningOptions(imported.cleaningOptions)
      setCustomRules(
        imported.customRules.map((rule) => ({
          id: rule.id || createRuleId(),
          find: rule.find,
          replace: rule.replace,
          enabled: rule.enabled,
        }))
      )

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

  function handleAddCustomRule() {
    const findValue = draftRuleFind.trim()

    if (!findValue) {
      setToast('Find value is required.')
      setLastAction('Custom rule was not added.')
      return
    }

    setRecoverState({ input, mode, cleaningOptions, customRules, history })
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
    setRecoverState({ input, mode, cleaningOptions, customRules, history })
    setCustomRules((current) =>
      current.map((rule) => (rule.id === ruleId ? { ...rule, [field]: value } : rule))
    )
  }

  function handleToggleCustomRule(ruleId) {
    setRecoverState({ input, mode, cleaningOptions, customRules, history })
    setCustomRules((current) =>
      current.map((rule) => (rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule))
    )
  }

  function handleDeleteCustomRule(ruleId) {
    setRecoverState({ input, mode, cleaningOptions, customRules, history })
    setCustomRules((current) => current.filter((rule) => rule.id !== ruleId))
    setToast('Custom rule deleted.')
    setLastAction('Custom rule deleted.')
  }

  const inputWords = countWords(input)
  const outputWords = countWords(displayedOutput)
  const historyPreview = history.slice(0, 5)
  const diffView = useMemo(() => buildTextDiff(input, displayedOutput), [input, displayedOutput])
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
  const hasInput = Boolean(input.trim())
  const hasHistory = history.length > 0
  const hasDisplayedOutput = Boolean(displayedOutput.trim())
  const outputNeedsRefresh = hasInput && !livePreviewEnabled && displayedOutput !== result.cleanedText
  const historyExportDisabled = !hasHistory || isSavingHistory || Boolean(exportingHistoryFormat)
  const cleanButtonLabel = isPasting ? 'Pasting...' : isCleaning ? 'Refreshing...' : outputNeedsRefresh ? 'Refresh output' : 'Clean'

  let workspaceStatus = ''

  if (isPasting) {
    workspaceStatus = 'Reading your clipboard and updating the workspace.'
  } else if (isCleaning) {
    workspaceStatus = 'Refreshing output and copying the latest result to your clipboard.'
  } else if (outputNeedsRefresh) {
    workspaceStatus = 'Live preview is paused. Press Refresh output to sync the latest result.'
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
            <div className="pcMenu" role="menu" aria-label="History menu">
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
                      <strong>{entry.modeLabel}</strong>
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
              </div>

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
                  Reset cleaning rules
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
                Clear local history
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
                onClick={() => {
                  const nextValue = !stripUrlsEnabled
                  setCleaningOptions((current) => ({
                    ...current,
                    stripTrackingParams: nextValue,
                    unwrapRedirects: nextValue,
                    decodeReadableUrls: nextValue,
                  }))
                }}
              >
                <span className="pcPillLeft">
                  <Link2Off size={16} />
                  <span>Strip URLs</span>
                </span>
                <span className="pcPillState">{stripUrlsEnabled ? 'On' : 'Off'}</span>
              </button>
            </div>
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
            </div>
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
              <p className="pcEditorLabel">Raw Input</p>
              <textarea
                className="pcEditor"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Start typing or paste content here..."
                spellCheck={false}
              />
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

          <div className="pcBottomTabs" aria-label="Format shortcuts">
            {MODE_OPTIONS.map((option) => (
              <button
                key={`bottom-${option.id}`}
                type="button"
                className={`pcBottomTab ${option.id === mode ? 'pcBottomTabActive' : ''}`}
                onClick={() => handleModeChange(option.id)}
              >
                {getModeLabel(option.id, option.label)}
              </button>
            ))}
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
