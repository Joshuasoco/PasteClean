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
import { buildTextDiff } from './utils/buildTextDiff'

const MODE_OPTIONS = getModes()
const DEFAULT_MODE = 'plain'

function App() {
  const [mode, setMode] = useState(DEFAULT_MODE)
  const [input, setInput] = useState(() => getModeDefinition(DEFAULT_MODE).sample)
  const [copyState, setCopyState] = useState('idle')
  const [clipboardState, setClipboardState] = useState('idle')
  const [cleaningOptions, setCleaningOptions] = useState(() => getDefaultCleaningOptions())
  const deferredInput = useDeferredValue(input)
  const deferredMode = useDeferredValue(mode)

  const result = useMemo(
    () => cleanText(deferredInput, deferredMode, cleaningOptions),
    [cleaningOptions, deferredInput, deferredMode]
  )
  const diff = useMemo(() => buildTextDiff(input, result.cleanedText), [input, result.cleanedText])

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

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Phase 4 - UX Polish</p>
        <h1>Live cleanup, rule toggles, and a shortcut-first paste flow.</h1>
        <p className="lede">
          PasteClean now updates the output live, lets you switch individual
          cleanup rules on or off, highlights every text change with a colored
          overlay, and supports <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd> to
          paste from your clipboard and clean instantly.
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
            <p className="panelLabel">Rule toggles</p>
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
          <p className="panelLabel">Active mode</p>
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
              <dt>Overlay deltas</dt>
              <dd>{diff.stats.removedCount + diff.stats.addedCount}</dd>
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
          <p className="panelLabel">Live preview</p>
          <h2>Instant feedback loop</h2>
          <ul className="ruleList">
            <li>The cleaned preview updates while you type.</li>
            <li>Rule toggles re-run the cleaner immediately.</li>
            <li>The diff overlay tracks every added or removed segment.</li>
          </ul>
        </article>
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
