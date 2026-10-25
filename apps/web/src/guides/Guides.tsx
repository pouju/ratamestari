import { useMemo } from 'react'
import { useFormat, useMessages, type Messages } from '../i18n'
import { APP_VERSION, RELEASE_URL, SAMPLE_QUERY, SOURCE_CODE_URL, SUBPAGE_PATHS } from '../config'
import { SAMPLE_RUN } from '../landing/demo-run'
import { ControlMark } from '../landing/Landing'
import { MapStage, SceneControls, useSceneClock } from './scene'
import { scenes, type GuideName, type Scene } from './scenes'

const GUIDE_ORDER: readonly GuideName[] = [
  'setCourse',
  'legRoutes',
  'courseRoutes',
  'keep',
  'drag',
  'setByHand',
  'planLeg',
  'assistant',
]

export function Guides() {
  const m = useMessages()
  const format = useFormat()
  const byName = useMemo(() => scenes(m, format), [m, format])
  const shown = GUIDE_ORDER.flatMap(name => {
    const scene = byName[name]
    return scene ? [{ name, scene }] : []
  })

  return (
    <div className="landing">
      <header className="landing-header landing-wide">
        <a href={SUBPAGE_PATHS.landing} className="landing-wordmark" aria-label={m.guides.backHome}>
          <ControlMark />
          Ratamestari
        </a>
        <nav aria-label={m.landing.nav.label} className="landing-nav">
          <a href={SOURCE_CODE_URL}>{m.landing.nav.sourceCode}</a>
          <a href={SUBPAGE_PATHS.app} className="landing-nav-app">
            {m.landing.nav.openApp}
          </a>
        </nav>
      </header>

      <main className="landing-wide guides">
        <section className="guides-intro">
          <h1>{m.guides.title}</h1>
          <p className="landing-lead">{m.guides.lead}</p>
          <div className="landing-actions">
            <a href={`${SUBPAGE_PATHS.app}?${SAMPLE_QUERY}`} className="landing-primary">
              {m.guides.trySample}
            </a>
          </div>
          <nav aria-label={m.guides.contents} className="guides-contents">
            {shown.map(({ name }) => (
              <a key={name} href={`#${name}`}>
                {m.guides[name].title}
              </a>
            ))}
            <a href="#tips">{m.guides.tips.title}</a>
          </nav>
        </section>

        {shown.map(({ name, scene }) => (
          <GuideSection key={name} name={name} scene={scene} />
        ))}

        <section id="tips" className="guides-tips" aria-labelledby="tips-title">
          <h2 id="tips-title">{m.guides.tips.title}</h2>
          <dl>
            {m.guides.tips.items.map(item => (
              <div key={item.title}>
                <dt>{item.title}</dt>
                <dd>{item.text}</dd>
              </div>
            ))}
          </dl>
        </section>
        <p className="hero-demo-credit">{m.guides.credit}</p>
      </main>

      <footer className="landing-footer landing-wide">
        <span>{m.landing.footer.licence}</span>
        <a href={SOURCE_CODE_URL}>{m.landing.footer.sourceCode}</a>
        <a href={RELEASE_URL}>{m.landing.footer.version(APP_VERSION)}</a>
        <span className="landing-footer-language">{m.landing.footer.language}</span>
      </footer>
    </div>
  )
}

type GuideMessages = Messages['guides'][GuideName] & { readonly tip?: string }

function GuideSection({ name, scene }: { name: GuideName; scene: Scene }) {
  const guide: GuideMessages = useMessages().guides[name]
  const clock = useSceneClock(scene.loopTicks, scene.stillTick)
  const step = scene.stepStarts.findLastIndex(start => clock.tick >= start)

  return (
    <section id={name} ref={clock.ref} className="guide" aria-labelledby={`${name}-title`}>
      <div className="guide-text">
        <h2 id={`${name}-title`}>{guide.title}</h2>
        <p className="guide-intro">{guide.intro}</p>
        <ol className="guide-steps-list">
          {guide.steps.map((text, i) => (
            <li key={text} className={i === step ? 'is-current' : undefined}>
              {text}
            </li>
          ))}
        </ol>
        {guide.tip && <p className="guide-soft">{guide.tip}</p>}
      </div>
      <figure className="guide-figure">
        <div className="guide-stage">
          <MapStage run={SAMPLE_RUN} view={scene.view} label={guide.label}>
            {scene.map(clock.tick)}
          </MapStage>
          <div className="guide-panel" aria-hidden="true">
            {scene.panel(clock.tick)}
          </div>
        </div>
        <SceneControls
          steps={scene.stepStarts.length}
          step={step}
          isStill={clock.isStill}
          isPaused={clock.isPaused}
          onTogglePaused={clock.togglePaused}
        />
      </figure>
    </section>
  )
}
