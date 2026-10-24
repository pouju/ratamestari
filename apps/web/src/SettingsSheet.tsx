import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { AssistantKey } from './assistant-key'
import { SOURCE_CODE_URL } from './config'
import { useMessages } from './i18n'

interface Props {
  isOpen: boolean
  onClose: () => void
  assistantKey: AssistantKey
  paceText: string
  onPaceTextChange: (text: string) => void
  isPaceValid: boolean
  map: ReactNode
}

export function SettingsSheet({
  isOpen,
  onClose,
  assistantKey,
  paceText,
  onPaceTextChange,
  isPaceValid,
  map,
}: Props) {
  const m = useMessages().settings
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (isOpen && !element.open) element.showModal()
    if (!isOpen && element.open) element.close()
  }, [isOpen])

  return (
    <dialog
      ref={dialog}
      className="settings"
      aria-labelledby="settings-title"
      onClose={onClose}
      onClick={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="settings-body">
        <div className="settings-header">
          <h2 id="settings-title">{m.title}</h2>
          <button type="button" className="settings-close" aria-label={m.close} onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
        </div>

        <AssistantSettings assistantKey={assistantKey} />

        <section className="settings-section" aria-labelledby="settings-course">
          <h3 id="settings-course">{m.course}</h3>
          <div className="settings-row">
            <div>
              <label htmlFor="settings-pace">{m.pace}</label>
              <p className="settings-soft">{m.paceHint}</p>
            </div>
            <span className="settings-pace">
              <input
                id="settings-pace"
                value={paceText}
                inputMode="numeric"
                size={5}
                aria-invalid={!isPaceValid}
                aria-describedby={isPaceValid ? undefined : 'settings-pace-error'}
                onChange={e => onPaceTextChange(e.target.value)}
              />
              {m.paceUnit}
            </span>
          </div>
          {!isPaceValid && (
            <p id="settings-pace-error" className="error">
              {m.paceInvalid}
            </p>
          )}
        </section>

        {map}

        <p className="settings-soft settings-footer">
          {m.licence} <a href={SOURCE_CODE_URL}>{m.sourceCode}</a>
        </p>
      </div>
    </dialog>
  )
}

function AssistantSettings({ assistantKey }: { assistantKey: AssistantKey }) {
  const m = useMessages().settings
  const [draft, setDraft] = useState('')
  const isOn = assistantKey.apiKey !== ''

  function turnOn(event: FormEvent) {
    event.preventDefault()
    const key = draft.trim()
    if (!key) return
    assistantKey.save(key)
    setDraft('')
  }

  return (
    <section className="settings-section" aria-labelledby="settings-assistant">
      <h3 id="settings-assistant">{m.assistant}</h3>
      <p>{isOn ? m.assistantOn : m.assistantIntro}</p>
      {isOn ? (
        <button type="button" className="settings-secondary" onClick={assistantKey.forget}>
          {m.turnOff}
        </button>
      ) : (
        <form className="settings-key" onSubmit={turnOn}>
          <label htmlFor="settings-key">{m.apiKey}</label>
          <input
            id="settings-key"
            type="password"
            value={draft}
            autoComplete="off"
            onChange={e => setDraft(e.target.value)}
          />
          <p className="settings-soft">
            {m.keyStorage} <a href="https://console.anthropic.com/">{m.getKey}</a>
          </p>
          <button type="submit" className="settings-primary" disabled={!draft.trim()}>
            {m.turnOn}
          </button>
        </form>
      )}
      <dl className="settings-sharing">
        <div>
          <dt>{m.receives}</dt>
          <dd>{m.receivesText}</dd>
        </div>
        <div>
          <dt>{m.neverReceives}</dt>
          <dd>{m.neverReceivesText}</dd>
        </div>
      </dl>
    </section>
  )
}
