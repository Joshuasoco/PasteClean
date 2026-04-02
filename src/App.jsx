import { useEffect, useMemo, useState, useDeferredValue } from 'react'
import { cleanText } from './features/cleaner/cleanText'

const SAMPLE_TEXT = `Here is a messy paste...\u200B

"Quarterly plan" &amp; weird&nbsp;spacing.

Wrapped link:
https://www.google.com/url?q=https%3A%2F%2Fexample.com%2Fdocs%2FQuarterly%2520Plan%3Futm_source%3Dnewsletter%26utm_medium%3Demail%26keep%3D1&sa=D&source=docs

Store link:
https://shop.example.com/New%20Drop?utm_campaign=spring-launch&utm_content=hero-banner&color=blue

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
        <p className="eyebrow">Phase 2 - URL and Link Tools</p>
        <h1>Clean paste junk and rescue links in one pass.</h1>
        <p className="lede">
          PasteClean now keeps the Phase 1 text fixes and adds URL cleanup:
          tracking parameters are stripped, redirect wrappers are unwrapped, and
          percent-encoded links become readable before you copy them back out.
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
            placeholder="Paste text, URLs, newsletter links, or redirect wrappers..."
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
            <li>UTM and click IDs removed from URLs</li>
            <li>Redirect wrapper links unwrapped</li>
            <li>Percent-encoded URLs made readable</li>
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
              <dt>URLs changed</dt>
              <dd>{result.urlSummary.urlsChanged}</dd>
            </div>
            <div>
              <dt>Tracking params removed</dt>
              <dd>{result.urlSummary.trackingParamsRemoved}</dd>
            </div>
            <div>
              <dt>Redirects unwrapped</dt>
              <dd>{result.urlSummary.redirectsUnwrapped}</dd>
            </div>
            <div>
              <dt>Readable URL decodes</dt>
              <dd>{result.urlSummary.urlsDecoded}</dd>
            </div>
          </dl>
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
            No wrapped or tracked URLs detected yet. Paste a newsletter, search
            result, or redirect link to see the cleanup diff here.
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
