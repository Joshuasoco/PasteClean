import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { History, Settings, UserCircle2 } from 'lucide-react'
import {
  CLEANING_RULES,
  cleanText,
  getDefaultCleaningOptions,
} from './features/cleaner/cleanText'
import { getModeDefinition, getModes } from './features/cleaner/modes'
import { usePasteHistory } from './hooks/usePasteHistory'

const MODE_OPTIONS = getModes()
const DEFAULT_MODE = 'plain'

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

function App() {
  const [mode, setMode] = useState(DEFAULT_MODE)
  const [input, setInput] = useState(() => getModeDefinition(DEFAULT_MODE).sample)
  const [cleaningOptions, setCleaningOptions] = useState(() => getDefaultCleaningOptions())
  const [toast, setToast] = useState('Live preview is active.')
  const [isPasting, setIsPasting] = useState(false)
  const [activeMenu, setActiveMenu] = useState(null)
  const menuWrapRef = useRef(null)

  const deferredInput = useDeferredValue(input)
  const deferredMode = useDeferredValue(mode)

  const result = useMemo(
    () => cleanText(deferredInput, deferredMode, cleaningOptions),
    [cleaningOptions, deferredInput, deferredMode]
  )

  const { history, clearHistory, historyLimit } = usePasteHistory({
    input,
    result,
    mode,
    customRuleSummary: result.customRuleSummary,
  })

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
        setActiveMenu(null)
      }
    }

    window.addEventListener('mousedown', handleClickAway)
    window.addEventListener('keydown', handleEsc)

    return () => {
      window.removeEventListener('mousedown', handleClickAway)
      window.removeEventListener('keydown', handleEsc)
    }
  }, [])

  async function pasteFromClipboard() {
    try {
      setIsPasting(true)
      const pastedText = await navigator.clipboard.readText()

      if (!pastedText) {
        setToast('Clipboard is empty.')
        return
      }

      startTransition(() => {
        setInput(pastedText)
      })
      setToast('Pasted from clipboard.')
    } catch {
      setToast('Clipboard access was blocked by the browser.')
    } finally {
      setIsPasting(false)
    }
  }

  async function handleClean() {
    if (!result.cleanedText) {
      return
    }

    try {
      await navigator.clipboard.writeText(result.cleanedText)
      setToast('Cleaned text copied to clipboard.')
    } catch {
      setToast('Unable to copy output.')
    }
  }

  function handleToggleRule(ruleKey) {
    setCleaningOptions((current) => ({
      ...current,
      [ruleKey]: !current[ruleKey],
    }))
  }

  function handleModeChange(nextMode) {
    startTransition(() => {
      setMode(nextMode)
    })
  }

  function toggleMenu(menuName) {
    setActiveMenu((current) => (current === menuName ? null : menuName))
  }

  function handleRestoreHistory(entry) {
    startTransition(() => {
      setInput(entry.input)
      setMode(entry.mode || DEFAULT_MODE)
    })
    setToast('History entry restored.')
    setActiveMenu(null)
  }

  function handleResetSettings() {
    setCleaningOptions(getDefaultCleaningOptions())
    setToast('Settings reset to default.')
    setActiveMenu(null)
  }

  function handleClearLocalData() {
    clearHistory()
    setCleaningOptions(getDefaultCleaningOptions())
    setToast('Local history cleared.')
    setActiveMenu(null)
  }

  const inputWords = countWords(input)
  const outputWords = countWords(result.cleanedText)
  const visibleRules = CLEANING_RULES.slice(0, 3)
  const historyPreview = history.slice(0, 5)

  return (
    <main className="pcShell">
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
              <p className="pcMenuTitle">Recent Pastes ({history.length}/{historyLimit})</p>
              {historyPreview.length === 0 ? (
                <p className="pcMenuEmpty">No saved pastes yet.</p>
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
            </div>
          ) : null}

          {activeMenu === 'settings' ? (
            <div className="pcMenu" role="menu" aria-label="Settings menu">
              <p className="pcMenuTitle">Settings</p>
              <button type="button" className="pcMenuAction" onClick={handleResetSettings}>
                Reset cleaning rules
              </button>
              <button type="button" className="pcMenuAction" onClick={() => void pasteFromClipboard()}>
                Paste from clipboard
              </button>
            </div>
          ) : null}

          {activeMenu === 'profile' ? (
            <div className="pcMenu" role="menu" aria-label="Profile menu">
              <p className="pcMenuTitle">Profile</p>
              <p className="pcMenuHint">This workspace runs locally in your browser.</p>
              <button type="button" className="pcMenuAction pcMenuDanger" onClick={handleClearLocalData}>
                Clear local history
              </button>
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
              <span className="pcSwitch pcSwitchOn" aria-hidden="true">
                <span className="pcSwitchKnob" />
              </span>
            </div>

            <p className="pcSubLabel">Processing Modes</p>
            <div className="pcModeToggles">
              {visibleRules.map((rule, index) => (
                <button
                  key={rule.key}
                  type="button"
                  className={`pcPillToggle ${cleaningOptions[rule.key] ? 'pcPillToggleActive' : ''}`}
                  onClick={() => handleToggleRule(rule.key)}
                >
                  {index === 0 ? 'Smart Clean' : index === 1 ? 'Fix Quotes' : 'Strip URLs'}
                </button>
              ))}
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
            <button type="button" className="pcCleanButton" onClick={handleClean}>
              Clean
            </button>
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
              <p className="pcEditorLabel pcEditorLabelLive">Live Preview</p>
              <textarea
                className="pcEditor pcEditorPreview"
                value={result.cleanedText}
                readOnly
                placeholder="Your cleaned content will appear here in real-time..."
              />
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
        </section>
      </section>

      <footer className="pcFooter">
        <span>(c) 2024 PasteClean</span>
        <span>{toast || (isPasting ? 'Pasting...' : 'Local storage: active')}</span>
        <span>PWA status: ready</span>
        <span>Privacy</span>
        <span>Terms</span>
      </footer>
    </main>
  )
}

export default App
