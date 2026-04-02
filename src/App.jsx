import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from 'react'
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
import { STORAGE_KEYS } from './utils/storageKeys'

const MODE_OPTIONS = getModes()
const DEFAULT_MODE = 'plain'

function createCustomRule() {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    find: '',
    replace: '',
    enabled: true,
  }
}

function formatSavedAt(value) {
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

function App() {
  const [mode, setMode] = useState(DEFAULT_MODE)
  const [input, setInput] = useState(() => getModeDefinition(DEFAULT_MODE).sample)
  const [copyState, setCopyState] = useState('idle')
  const [clipboardState, setClipboardState] = useState('idle')
  const [memoryState, setMemoryState] = useState('idle')
  const [cleaningOptions, setCleaningOptions] = useState(() => getDefaultCleaningOptions())
  const [customRules, setCustomRules] = useStoredState(STORAGE_KEYS.customRules, [])
  const deferredInput = useDeferredValue(input)
  const deferredMode = useDeferredValue(mode)
  const cleaningConfig = useMemo(
    () => ({ ...cleaningOptions, customRules }),
    [cleaningOptions, customRules]
  )

  const result = useMemo(
    () => cleanText(deferredInput, deferredMode, cleaningConfig),
    [cleaningConfig, deferredInput, deferredMode]
  )
  const diff = useMemo(() => buildTextDiff(input, result.cleanedText), [input, result.cleanedText])
  const { history, clearHistory, historyLimit } = usePasteHistory({
    input,
    result,
    mode,
    customRuleSummary: result.customRuleSummary,
  })

  useEffect(() => {
    if (copyState !== 'copied') {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      setCopyState('idle')
    }, 1800)

    return () => window.clearTimeout(timeoutId)
  }, [copyState])

  useEffect(() => {
    if (clipboardState === 'idle') {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      setClipboardState('idle')
    }, 2400)

    return () => window.clearTimeout(timeoutId)
  }, [clipboardState])

  useEffect(() => {
    if (memoryState === 'idle') {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      setMemoryState('idle')
    }, 2600)

    return () => window.clearTimeout(timeoutId)
  }, [memoryState])

  const pasteFromClipboard = useEffectEvent(async () => {
    try {
      const pastedText = await navigator.clipboard.readText()

      if (!pastedText) {
        setClipboardState('empty')
        return
      }

      startTransition(() => {
        setInput(pastedText)
        setCopyState('idle')
        setClipboardState('pasted')
      })
    } catch {
      setClipboardState('error')
    }
  })

  useEffect(() => {
    function handleKeyDown(event) {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.key.toLowerCase() !== 'v') {
        return
      }

      event.preventDefault()
      pasteFromClipboard()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function handleModeChange(nextMode) {
    startTransition(() => {
      setMode(nextMode)
      setCopyState('idle')
    })
  }

  function handleLoadSample() {
    const sample = getModeDefinition(mode).sample

    startTransition(() => {
      setInput(sample)
      setCopyState('idle')
      setClipboardState('idle')
    })
  }

  function handleToggleRule(ruleKey) {
    setCleaningOptions((current) => ({
      ...current,
      [ruleKey]: !current[ruleKey],
    }))
    setCopyState('idle')
  }

  function handleAddCustomRule() {
    setCustomRules((current) => [...current, createCustomRule()])
    setMemoryState('rule-saved')
  }

  function handleCustomRuleChange(ruleId, field, value) {
    setCustomRules((current) =>
      current.map((rule) => (rule.id === ruleId ? { ...rule, [field]: value } : rule))
    )
    setCopyState('idle')
  }

  function handleRemoveCustomRule(ruleId) {
    setCustomRules((current) => current.filter((rule) => rule.id !== ruleId))
    setMemoryState('rule-removed')
    setCopyState('idle')
  }

  function handleRestoreHistory(entry) {
    startTransition(() => {
      setInput(entry.input)
      setMode(entry.mode)
      setCopyState('idle')
      setClipboardState('idle')
      setMemoryState('restored')
    })
  }

  function handleExportHistory(format) {
    const exported = exportHistory(history, format)

    if (!exported) {
      setMemoryState('export-empty')
      return
    }

    setMemoryState(format === 'csv' ? 'exported-csv' : 'exported-txt')
  }

  function handleClearAllData() {
    startTransition(() => {
      setInput('')
      setMode(DEFAULT_MODE)
      setCleaningOptions(getDefaultCleaningOptions())
      setCustomRules([])
      clearHistory()
      setCopyState('idle')
      setClipboardState('idle')
      setMemoryState('cleared')
    })

    try {
      window.localStorage.removeItem(STORAGE_KEYS.history)
      window.localStorage.removeItem(STORAGE_KEYS.customRules)
    } catch {
      return
    }
  }

  async function handleCopy() {
    if (!result.cleanedText) {
      return
    }

    try {
      await navigator.clipboard.writeText(result.cleanedText)
      setCopyState('copied')
    } catch {
      setCopyState('error')
    }
  }

  const enabledRuleCount = CLEANING_RULES.filter((rule) => cleaningOptions[rule.key]).length
  const activeCustomRuleCount = customRules.filter((rule) => rule.enabled && rule.find).length

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Phase 5 - Memory and History</p>
        <h1>Remember pastes, layer in custom rules, and export your cleanup trail.</h1>
        <p className="lede">
          PasteClean now stores your last {historyLimit} pastes locally, supports
          custom find and replace rules, exports history as <code>.txt</code> or{' '}
          <code>.csv</code>, and lets you wipe stored data in one click when you
          are done.
        </p>
      </section>

      <section className="modeSection">
        <div className="modeHeader">
          <div>
            <p className="panelLabel">Format modes</p>
            <h2>How should this paste be treated?</h2>
          </div>
          <div className="actionRow">
            <button type="button" className="secondaryButton" onClick={handleLoadSample}>
              Load {getModeDefinition(mode).label} sample
            </button>
            <button type="button" className="secondaryButton" onClick={pasteFromClipboard}>
              Paste from clipboard
            </button>
          </div>
        </div>

        <div className="toolbar">
          <span className="shortcutPill">Shortcut: Ctrl + Shift + V</span>
          <span className={`statusPill ${clipboardState !== 'idle' ? 'statusPillVisible' : ''}`}>
            {clipboardState === 'pasted' && 'Clipboard pasted into the live preview.'}
            {clipboardState === 'empty' && 'Clipboard is empty.'}
            {clipboardState === 'error' && 'Clipboard read was blocked by the browser.'}
            {clipboardState === 'idle' && 'Live preview is ready.'}
          </span>
        </div>

        <div className="modeGrid">
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`modeButton ${option.id === mode ? 'modeButtonActive' : ''}`}
              onClick={() => handleModeChange(option.id)}
            >
              <span className="modeButtonTitle">{option.label}</span>
              <span className="modeButtonDescription">{option.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="ruleSection">
        <div className="modeHeader">
          <div>
            <p className="panelLabel">Built-in rules</p>
            <h2>Choose exactly what gets cleaned</h2>
          </div>
          <span className="pill">{enabledRuleCount}/{CLEANING_RULES.length} enabled</span>
        </div>

        <div className="ruleGrid">
          {CLEANING_RULES.map((rule) => (
            <label className="toggleCard" key={rule.key}>
              <input
                type="checkbox"
                checked={cleaningOptions[rule.key]}
                onChange={() => handleToggleRule(rule.key)}
              />
              <span className="toggleVisual" aria-hidden="true">
                <span className="toggleKnob" />
              </span>
              <span className="toggleCopy">
                <span className="toggleTitle">{rule.label}</span>
                <span className="toggleDescription">{rule.description}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="customRuleSection">
        <div className="modeHeader">
          <div>
            <p className="panelLabel">Custom replacements</p>
            <h2>User-defined find and replace rules</h2>
          </div>
          <div className="actionRow">
            <span className="pill pillAlt">{activeCustomRuleCount} active</span>
            <button type="button" className="secondaryButton" onClick={handleAddCustomRule}>
              Add custom rule
            </button>
          </div>
        </div>

        {customRules.length === 0 ? (
          <article className="diffEmpty">
            No custom rules yet. Add one to replace brand names, repeated phrases,
            or your own cleanup patterns after the built-in processing runs.
          </article>
        ) : (
          <div className="customRuleGrid">
            {customRules.map((rule, index) => (
              <article className="customRuleCard" key={rule.id}>
                <div className="customRuleHeader">
                  <div>
                    <p className="panelLabel">Rule {index + 1}</p>
                    <h2 className="miniHeading">Literal find and replace</h2>
                  </div>
                  <div className="actionRow">
                    <label className="miniToggle">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={(event) =>
                          handleCustomRuleChange(rule.id, 'enabled', event.target.checked)
                        }
                      />
                      <span>{rule.enabled ? 'Enabled' : 'Disabled'}</span>
                    </label>
                    <button
                      type="button"
                      className="dangerButton"
                      onClick={() => handleRemoveCustomRule(rule.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div className="fieldGrid">
                  <label className="field">
                    <span>Find</span>
                    <input
                      type="text"
                      value={rule.find}
                      onChange={(event) =>
                        handleCustomRuleChange(rule.id, 'find', event.target.value)
                      }
                      placeholder="Text to replace"
                    />
                  </label>

                  <label className="field">
                    <span>Replace with</span>
                    <input
                      type="text"
                      value={rule.replace}
                      onChange={(event) =>
                        handleCustomRuleChange(rule.id, 'replace', event.target.value)
                      }
                      placeholder="Replacement text"
                    />
                  </label>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="workspace">
        <article className="panel">
          <div className="panelHeader">
            <div>
              <p className="panelLabel">Raw paste</p>
              <h2>Input</h2>
            </div>
            <span className="pill">{input.length} chars</span>
          </div>

          <textarea
            className="editor"
            value={input}
            onChange={(event) => {
              setInput(event.target.value)
              setCopyState('idle')
            }}
            placeholder="Paste plain text, Markdown, code, or an email thread..."
            spellCheck={false}
          />
        </article>

        <article className="panel panelAccent">
          <div className="panelHeader">
            <div>
              <p className="panelLabel">Cleaned result</p>
              <h2>{result.modeLabel} live preview</h2>
            </div>

            <div className="actionRow">
              <span className="pill pillLive">Live</span>
              <button
                type="button"
                className="copyButton"
                onClick={handleCopy}
                disabled={!result.cleanedText}
              >
                {copyState === 'copied'
                  ? 'Copied'
                  : copyState === 'error'
                    ? 'Copy failed'
                    : 'Copy output'}
              </button>
            </div>
          </div>

          <textarea
            className="editor editorOutput"
            value={result.cleanedText}
            readOnly
            placeholder="Your cleaned text will appear here."
          />
        </article>
      </section>

      <section className="insights">
        <article className="infoCard">
          <p className="panelLabel">Current session</p>
          <h2>{result.modeLabel}</h2>
          <p className="cardText">{result.modeDescription}</p>
          <ul className="ruleList">
            {result.modeRules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </article>

        <article className="infoCard">
          <p className="panelLabel">This paste</p>
          <dl className="stats">
            <div>
              <dt>Characters removed</dt>
              <dd>{result.removedCharacters}</dd>
            </div>
            <div>
              <dt>Line count</dt>
              <dd>
                {result.lineCountBefore} {'->'} {result.lineCountAfter}
              </dd>
            </div>
            <div>
              <dt>URLs changed</dt>
              <dd>{result.urlSummary.urlsChanged}</dd>
            </div>
            <div>
              <dt>Custom replacements</dt>
              <dd>{result.customRuleSummary.replacementsMade}</dd>
            </div>
            <div>
              <dt>Saved pastes</dt>
              <dd>{history.length}</dd>
            </div>
            {result.modeSummary.stats.map((stat) => (
              <div key={stat.label}>
                <dt>{stat.label}</dt>
                <dd>{stat.value}</dd>
              </div>
            ))}
          </dl>
        </article>
      </section>

      <section className="insights insightsSecondary">
        <article className="infoCard">
          <p className="panelLabel">Mode effect</p>
          <h2>{result.modeSummary.title}</h2>
          <ul className="highlightList">
            {result.modeSummary.highlights.map((highlight) => (
              <li key={highlight}>{highlight}</li>
            ))}
          </ul>
        </article>

        <article className="infoCard">
          <p className="panelLabel">Memory status</p>
          <h2>Local-only storage</h2>
          <ul className="ruleList">
            <li>History is capped at the last {historyLimit} pastes.</li>
            <li>Custom rules are saved only in this browser.</li>
            <li>Clear all data wipes saved history and custom rules.</li>
          </ul>
        </article>
      </section>

      <section className="historySection">
        <div className="modeHeader">
          <div>
            <p className="panelLabel">Memory and history</p>
            <h2>Restore, export, or clear saved data</h2>
          </div>
          <div className="actionRow">
            <button type="button" className="secondaryButton" onClick={() => handleExportHistory('txt')}>
              Export .txt
            </button>
            <button type="button" className="secondaryButton" onClick={() => handleExportHistory('csv')}>
              Export .csv
            </button>
            <button type="button" className="dangerButton" onClick={handleClearAllData}>
              Clear all data
            </button>
          </div>
        </div>

        <div className="toolbar">
          <span className="shortcutPill">Stored locally: history + custom rules</span>
          <span className={`statusPill ${memoryState !== 'idle' ? 'statusPillVisible' : ''}`}>
            {memoryState === 'rule-saved' && 'Custom rule added.'}
            {memoryState === 'rule-removed' && 'Custom rule removed.'}
            {memoryState === 'restored' && 'History entry restored into the editor.'}
            {memoryState === 'exported-txt' && 'History exported as a .txt file.'}
            {memoryState === 'exported-csv' && 'History exported as a .csv file.'}
            {memoryState === 'export-empty' && 'There is no saved history to export yet.'}
            {memoryState === 'cleared' && 'Stored history and custom rules were cleared.'}
            {memoryState === 'idle' && 'History saves automatically after you pause typing.'}
          </span>
        </div>

        {history.length === 0 ? (
          <article className="diffEmpty">
            No saved pastes yet. Start typing or paste something and PasteClean
            will remember the latest entries locally.
          </article>
        ) : (
          <div className="historyGrid">
            {history.map((entry) => (
              <article className="historyCard" key={entry.id}>
                <div className="customRuleHeader">
                  <div>
                    <p className="panelLabel">{entry.modeLabel}</p>
                    <h2 className="miniHeading">{formatSavedAt(entry.savedAt)}</h2>
                  </div>
                  <button
                    type="button"
                    className="secondaryButton"
                    onClick={() => handleRestoreHistory(entry)}
                  >
                    Restore
                  </button>
                </div>

                <dl className="historyStats">
                  <div>
                    <dt>URLs changed</dt>
                    <dd>{entry.urlChanges}</dd>
                  </div>
                  <div>
                    <dt>Custom replacements</dt>
                    <dd>{entry.customReplacements}</dd>
                  </div>
                </dl>

                <div className="historyPreview">
                  <p className="panelLabel">Input preview</p>
                  <p>{entry.input.slice(0, 180) || 'Empty paste'}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="diffSection">
        <div className="diffHeader">
          <div>
            <p className="panelLabel">Colored overlay</p>
            <h2>Every change, highlighted</h2>
          </div>
          <span className="pill pillAlt">
            {diff.stats.changed
              ? `${diff.stats.removedCount} removed / ${diff.stats.addedCount} added`
              : 'No changes'}
          </span>
        </div>

        {diff.stats.changed ? (
          <div className="overlayGrid">
            <article className="overlayCard overlayCardBefore">
              <p className="panelLabel">Original</p>
              <pre className="overlayText">
                {diff.beforeSegments.map((segment, index) => (
                  <span
                    key={`${segment.type}-${index}`}
                    className={segment.type === 'removed' ? 'diffToken diffTokenRemoved' : 'diffToken'}
                  >
                    {segment.value}
                  </span>
                ))}
              </pre>
            </article>

            <article className="overlayCard overlayCardAfter">
              <p className="panelLabel">Cleaned</p>
              <pre className="overlayText">
                {diff.afterSegments.map((segment, index) => (
                  <span
                    key={`${segment.type}-${index}`}
                    className={segment.type === 'added' ? 'diffToken diffTokenAdded' : 'diffToken'}
                  >
                    {segment.value}
                  </span>
                ))}
              </pre>
            </article>
          </div>
        ) : (
          <article className="diffEmpty">
            No text changes are highlighted because the current rule set already
            matches the pasted content.
          </article>
        )}
      </section>

      <section className="diffSection">
        <div className="diffHeader">
          <div>
            <p className="panelLabel">URL cleanup log</p>
            <h2>Before and after links</h2>
          </div>
          <span className="pill pillAlt">
            {result.urlChanges.length === 0
              ? 'No URL changes'
              : `${result.urlChanges.length} cleaned`}
          </span>
        </div>

        {result.urlChanges.length === 0 ? (
          <article className="diffEmpty">
            This paste did not trigger the URL tools with the current rule
            toggles.
          </article>
        ) : (
          <div className="diffGrid">
            {result.urlChanges.map((change) => (
              <article className="diffCard" key={`${change.originalUrl}-${change.cleanedUrl}`}>
                <div className="diffCols">
                  <div className="diffBlock">
                    <p className="panelLabel">Before</p>
                    <code>{change.originalUrl}</code>
                  </div>
                  <div className="diffBlock diffBlockAfter">
                    <p className="panelLabel">After</p>
                    <code>{change.cleanedUrl}</code>
                  </div>
                </div>

                <div className="tagRow">
                  {change.removedItems.map((item) => (
                    <span className="tag" key={item}>
                      {item}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

export default App
