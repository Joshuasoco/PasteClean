import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { cleanText } from './features/cleaner/cleanText'
import { getModeDefinition, getModes } from './features/cleaner/modes'

const MODE_OPTIONS = getModes()
const DEFAULT_MODE = 'plain'

function App() {
  const [mode, setMode] = useState(DEFAULT_MODE)
  const [input, setInput] = useState(() => getModeDefinition(DEFAULT_MODE).sample)
  const [copyState, setCopyState] = useState('idle')
  const deferredInput = useDeferredValue(input)
  const deferredMode = useDeferredValue(mode)

  const result = useMemo(() => cleanText(deferredInput, deferredMode), [deferredInput, deferredMode])

  useEffect(() => {
    if (copyState !== 'copied') {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      setCopyState('idle')
    }, 1800)

    return () => window.clearTimeout(timeoutId)
  }, [copyState])

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
    })
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

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Phase 3 - Format Modes</p>
        <h1>Choose the cleanup mode that matches what you pasted.</h1>
        <p className="lede">
          PasteClean now supports plain text, Markdown, code, and email flows.
          Each mode keeps the right structure while still applying the earlier
          character cleanup and URL tools underneath.
        </p>
      </section>

      <section className="modeSection">
        <div className="modeHeader">
          <div>
            <p className="panelLabel">Format modes</p>
            <h2>How should this paste be treated?</h2>
          </div>
          <button type="button" className="secondaryButton" onClick={handleLoadSample}>
            Load {getModeDefinition(mode).label} sample
          </button>
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
              <h2>{result.modeLabel} output</h2>
            </div>

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
          <p className="panelLabel">URL tools</p>
          <h2>Still active in every mode</h2>
          <ul className="ruleList">
            <li>UTM and click IDs are removed.</li>
            <li>Redirect wrapper links are unwrapped.</li>
            <li>Percent-encoded URLs are made readable.</li>
          </ul>
        </article>
      </section>

      <section className="diffSection">
        <div className="diffHeader">
          <div>
            <p className="panelLabel">Before and after</p>
            <h2>URL diff view</h2>
          </div>
          <span className="pill pillAlt">
            {result.urlChanges.length === 0
              ? 'No URL changes'
              : `${result.urlChanges.length} cleaned`}
          </span>
        </div>

        {result.urlChanges.length === 0 ? (
          <article className="diffEmpty">
            This paste did not trigger the URL tools. The selected format mode
            still cleaned the content and preserved the right structure.
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
