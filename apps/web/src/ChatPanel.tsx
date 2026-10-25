import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  COURSE_SETTER_SYSTEM_PROMPT,
  createClaudeProvider,
  type AgentTool,
} from '@ratamestari/agent'
import { track } from './analytics'
import { useMessages } from './i18n'

interface ChatMessage {
  readonly role: 'user' | 'assistant' | 'error'
  readonly text: string
}

export function ChatPanel({ apiKey, tools }: { apiKey: string; tools: readonly AgentTool[] }) {
  const m = useMessages().chat
  const [messages, setMessages] = useState<readonly ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [isReplying, setIsReplying] = useState(false)
  const abortController = useRef<AbortController | null>(null)

  useEffect(() => () => abortController.current?.abort(), [])

  const chat = useMemo(() => {
    if (!apiKey) return null
    const provider = createClaudeProvider(apiKey)
    return {
      provider,
      session: provider.startChat({ systemPrompt: COURSE_SETTER_SYSTEM_PROMPT, tools }),
    }
  }, [apiKey, tools])

  async function send(e: FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!chat || !text || isReplying) return
    setDraft('')
    setIsReplying(true)
    track('assistant-asked')
    setMessages(previous => [...previous, { role: 'user', text }, { role: 'assistant', text: '' }])
    const appendToReply = (delta: string) =>
      setMessages(previous => {
        const last = previous.at(-1)
        return last ? [...previous.slice(0, -1), { ...last, text: last.text + delta }] : previous
      })
    const controller = new AbortController()
    abortController.current = controller
    try {
      await chat.session.send(text, appendToReply, controller.signal)
    } catch (error) {
      setMessages(previous => [
        ...previous.filter(message => message.role !== 'assistant' || message.text !== ''),
        { role: 'error', text: chat.provider.describeError(error) },
      ])
    } finally {
      abortController.current = null
      setIsReplying(false)
    }
  }

  if (!chat) return null

  return (
    <section className="chat" aria-label={m.title}>
      <div className="chat-messages" aria-live="polite">
        {messages.length === 0 && <p className="chat-empty">{m.empty}</p>}
        {messages.map((message, i) => (
          <p key={i} className={`chat-message chat-${message.role}`}>
            {message.text || '…'}
          </p>
        ))}
      </div>
      <form className="chat-composer" onSubmit={send}>
        <label htmlFor="chat-draft" className="visually-hidden">
          {m.inputLabel}
        </label>
        <textarea
          id="chat-draft"
          value={draft}
          rows={2}
          placeholder={m.placeholder}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              e.currentTarget.form?.requestSubmit()
            }
          }}
        />
        {isReplying ? (
          <button
            type="button"
            className="chat-send"
            aria-label={m.stop}
            onClick={() => abortController.current?.abort()}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <rect width="14" height="14" rx="2" fill="currentColor" />
            </svg>
          </button>
        ) : (
          <button type="submit" className="chat-send" aria-label={m.send} disabled={!draft.trim()}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        )}
      </form>
    </section>
  )
}
