import { useEffect, useMemo, useState, useDeferredValue } from 'react'
import { cleanText } from './features/cleaner/cleanText'

const SAMPLE_TEXT = `Here\u2019s a messy paste...\u200B

\u201cQuoted text\u201d &amp; weird&nbsp;spacing.   

Another line with a soft hyphen right here: co\u00adoperate.



Last line \u2014 with extra spaces.   `

function App() {
  const [input, setInput] = useState(SAMPLE_TEXT)
  const [copyState, setCopyState] = useState('idle')
  const deferredInput = useDeferredValue(input)

  const result = useMemo(() => cleanText(deferredInput), [deferredInput])

  useEffect(() => {
    if (copyState !== 'copied') {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      setCopyState('idle')
    }, 1800)

    return () => window.clearTimeout(timeoutId)
  }, [copyState])

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
        <p className="eyebrow">Phase 1 - Core Cleaning Engine</p>
        <h1>Paste messy text. Copy back something clean.</h1>
        <p className="lede">
          PasteClean runs fully in your browser and fixes common paste damage:
          invisible characters, HTML entities, curly punctuation, duplicate blank
          lines, and trailing whitespace.
        </p>
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
            onChange={(event) => setInput(event.target.value)}
            placeholder="Paste text from a website, PDF, email, or document..."
            spellCheck={false}
          />
        </article>

        <article className="panel panelAccent">
          <div className="panelHeader">
            <div>
              <p className="panelLabel">Cleaned result</p>
              <h2>Output</h2>
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
          <p className="panelLabel">Rules applied</p>
          <ul className="ruleList">
            <li>Invisible Unicode stripped</li>
            <li>HTML entities decoded</li>
            <li>Smart punctuation normalized</li>
            <li>Blank lines collapsed</li>
            <li>Trailing whitespace removed</li>
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
              <dt>Status</dt>
              <dd>{result.changed ? 'Cleaned' : 'Already clean'}</dd>
            </div>
          </dl>
        </article>
      </section>
    </main>
  )
}

export default App
