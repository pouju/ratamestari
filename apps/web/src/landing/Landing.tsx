import { useMessages } from '../i18n'
import {
  APP_PATH,
  AUTHOR_URL,
  FEEDBACK_URL,
  OCAD2GEOJSON_URL,
  SAMPLE_QUERY,
  SOURCE_CODE_URL,
} from '../config'
import { SAMPLE_RUN } from './demo-run'
import { HeroDemo } from './HeroDemo'

const CREDIT_LINKS: Readonly<Record<string, string>> = { ocad2geojson: OCAD2GEOJSON_URL }

export function Landing() {
  const m = useMessages().landing

  return (
    <div className="landing">
      <header className="landing-header landing-wide">
        <a href="#top" className="landing-wordmark">
          <ControlMark />
          Ratamestari
        </a>
        <nav aria-label={m.nav.label} className="landing-nav">
          <a href="#how">{m.nav.how}</a>
          <a href="#status">{m.nav.status}</a>
          <a href="#privacy">{m.nav.privacy}</a>
          <a href={SOURCE_CODE_URL}>{m.nav.sourceCode}</a>
          <a href={APP_PATH} className="landing-nav-app">
            {m.nav.openApp}
          </a>
        </nav>
      </header>

      <main>
        <section id="top" className="landing-hero landing-wide">
          <div className="landing-hero-text">
            <h1>{m.hero.title}</h1>
            <p className="landing-lead">{m.hero.lead}</p>
            <div className="landing-actions">
              <a href={`${APP_PATH}?${SAMPLE_QUERY}`} className="landing-primary">
                {m.hero.trySample}
              </a>
              <a href={APP_PATH} className="landing-secondary">
                {m.hero.openOwn}
              </a>
              <a href={APP_PATH} className="landing-secondary">
                {m.hero.checkOwn}
              </a>
            </div>
            <p className="landing-soft">{m.hero.privacy}</p>
          </div>
          <div className="landing-hero-demo">
            <HeroDemo run={SAMPLE_RUN} />
          </div>
        </section>

        <section id="how" className="landing-section landing-wide" aria-labelledby="how-title">
          <h2 id="how-title">{m.how.title}</h2>
          <ol className="landing-steps">
            {m.how.steps.map((step, i) => (
              <li key={step.title}>
                <div className="landing-step-mark">
                  <StepSymbol index={i} last={m.how.steps.length - 1} />
                  {i < m.how.steps.length - 1 && (
                    <span className="landing-leg" aria-hidden="true" />
                  )}
                </div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-band" aria-labelledby="checks-title">
          <div className="landing-split landing-wide">
            <div className="landing-split-text">
              <h2 id="checks-title">{m.checks.title}</h2>
              <p className="landing-lead">{m.checks.text}</p>
            </div>
            <figure className="landing-paper" aria-label={m.checks.exampleLabel}>
              <strong className="landing-paper-title">{m.checks.exampleTitle}</strong>
              {m.checks.examples.map(example => (
                <div key={example.text} className="landing-finding">
                  <SeverityMark
                    severity={example.severity}
                    label={example.severity === 'error' ? m.checks.error : m.checks.note}
                  />
                  <div>
                    <p>{example.text}</p>
                    <p className="landing-soft landing-small">{example.basis}</p>
                  </div>
                  <span className="landing-fix">{m.checks.fix}</span>
                </div>
              ))}
            </figure>
          </div>
        </section>

        <section
          id="status"
          className="landing-section landing-wide"
          aria-labelledby="status-title"
        >
          <h2 id="status-title">{m.status.title}</h2>
          <p className="landing-lead">{m.status.text}</p>
          <div className="landing-columns">
            {m.status.columns.map(column => (
              <div key={column.title}>
                <h3>{column.title}</h3>
                <ul>
                  {column.items.map(item => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section
          id="privacy"
          className="landing-split landing-wide"
          aria-labelledby="privacy-title"
        >
          <div className="landing-split-text">
            <h2 id="privacy-title">{m.privacy.title}</h2>
            {m.privacy.paragraphs.map(paragraph => (
              <p key={paragraph} className="landing-lead">
                {paragraph}
              </p>
            ))}
          </div>
          <figure className="landing-chat" aria-label={m.privacy.exampleLabel}>
            <p className="landing-chat-question">{m.privacy.exampleQuestion}</p>
            <p>{m.privacy.exampleAnswer}</p>
          </figure>
        </section>

        <section
          id="credits"
          className="landing-credits landing-wide"
          aria-labelledby="credits-title"
        >
          <div className="landing-author">
            <h2 id="credits-title">
              {m.credits.madeBy} <a href={AUTHOR_URL}>{m.credits.author}</a>
            </h2>
            <p>{m.credits.about}</p>
            <p className="landing-links">
              <a href={AUTHOR_URL}>{m.credits.github}</a>
              <a href={FEEDBACK_URL}>{m.credits.feedback}</a>
            </p>
          </div>
          <dl className="landing-credit-list">
            {m.credits.items.map(item => {
              const href = item.link === null ? undefined : CREDIT_LINKS[item.link]
              return (
                <div key={item.title}>
                  <dt>{item.title}</dt>
                  <dd>{href ? <a href={href}>{item.text}</a> : item.text}</dd>
                </div>
              )
            })}
          </dl>
        </section>
      </main>

      <footer className="landing-footer landing-wide">
        <span>
          {m.footer.by} <a href={AUTHOR_URL}>{m.credits.author}</a>
        </span>
        <span>{m.footer.licence}</span>
        <a href={SOURCE_CODE_URL}>{m.footer.sourceCode}</a>
        <span className="landing-footer-language">{m.footer.language}</span>
      </footer>
    </div>
  )
}

function ControlMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <circle cx="13" cy="13" r="10" fill="none" stroke="currentColor" strokeWidth="2.6" />
      <circle cx="13" cy="13" r="2.4" fill="currentColor" />
    </svg>
  )
}

function StepSymbol({ index, last }: { index: number; last: number }) {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true" className="landing-symbol">
      {index === 0 && <polygon points="28,6 50,46 6,46" />}
      {index > 0 && index < last && (
        <>
          <circle cx="28" cy="28" r="22" />
          <text x="28" y="36" textAnchor="middle">
            {index}
          </text>
        </>
      )}
      {index === last && (
        <>
          <circle cx="28" cy="28" r="14" />
          <circle cx="28" cy="28" r="22" />
        </>
      )}
    </svg>
  )
}

function SeverityMark({ severity, label }: { severity: string; label: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" role="img" aria-label={label}>
      {severity === 'error' ? (
        <polygon points="9,1 17,16 1,16" fill="var(--colour-contour-brown)" />
      ) : (
        <circle cx="9" cy="9" r="7" fill="none" stroke="var(--colour-ink-soft)" strokeWidth="2" />
      )}
    </svg>
  )
}
