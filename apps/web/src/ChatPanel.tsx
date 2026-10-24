import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  COURSE_SETTER_SYSTEM_PROMPT,
  createClaudeProvider,
  type AgentTool,
} from '@ratamestari/agent'

interface ChatMessage {
  readonly role: 'user' | 'assistant' | 'error'
  readonly text: string
}

export function ChatPanel({ apiKey, tools }: { apiKey: string; tools: readonly AgentTool[] }) {
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
    <section className="chat">
      <h2>Assistant</h2>
      <div className="messages">
        {messages.length === 0 && (
          <p className="note">Ask for a course, e.g. “SM-tason pitkä matka H21”.</p>
        )}
        {messages.map((message, i) => (
          <p key={i} className={`message ${message.role}`}>
            {message.text || '…'}
          </p>
        ))}
      </div>
      <form className="chat-input" onSubmit={send}>
        <textarea
          value={draft}
          rows={2}
          placeholder="Message the assistant"
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              e.currentTarget.form?.requestSubmit()
            }
          }}
        />
        {isReplying ? (
          <button type="button" onClick={() => abortController.current?.abort()}>
            Stop
          </button>
        ) : (
          <button type="submit" disabled={!draft.trim()}>
            Send
          </button>
        )}
      </form>
    </section>
  )
}
