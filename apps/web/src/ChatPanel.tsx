import { useMemo, useRef, useState, type FormEvent } from 'react'
import {
  COURSE_SETTER_SYSTEM_PROMPT,
  createClaudeProvider,
  type AgentTool,
} from '@ratamestari/agent'

const API_KEY_STORAGE_KEY = 'ratamestari.anthropicApiKey'

interface ChatMessage {
  readonly role: 'user' | 'assistant' | 'error'
  readonly text: string
}

function readStoredKey(): string {
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function storeKey(apiKey: string | null) {
  try {
    if (apiKey) localStorage.setItem(API_KEY_STORAGE_KEY, apiKey)
    else localStorage.removeItem(API_KEY_STORAGE_KEY)
  } catch {
    // Without storage the key lives only until the page is reloaded.
  }
}

export function ChatPanel({ tools }: { tools: readonly AgentTool[] }) {
  const [apiKey, setApiKey] = useState(readStoredKey)
  const [keyDraft, setKeyDraft] = useState('')
  const [messages, setMessages] = useState<readonly ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [isReplying, setIsReplying] = useState(false)
  const abortController = useRef<AbortController | null>(null)

  const chat = useMemo(() => {
    if (!apiKey) return null
    const provider = createClaudeProvider(apiKey)
    return {
      provider,
      session: provider.startChat({ systemPrompt: COURSE_SETTER_SYSTEM_PROMPT, tools }),
    }
  }, [apiKey, tools])

  function saveKey(e: FormEvent) {
    e.preventDefault()
    const trimmed = keyDraft.trim()
    if (!trimmed) return
    storeKey(trimmed)
    setApiKey(trimmed)
    setKeyDraft('')
  }

  function forgetKey() {
    abortController.current?.abort()
    storeKey(null)
    setApiKey('')
    setMessages([])
  }

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

  if (!chat) {
    return (
      <section>
        <h2>Assistant</h2>
        <form className="api-key" onSubmit={saveKey}>
          <input
            type="password"
            placeholder="Claude API key"
            value={keyDraft}
            onChange={e => setKeyDraft(e.target.value)}
            autoComplete="off"
          />
          <button type="submit">Save</button>
        </form>
        <p className="note">
          Uses your own key from console.anthropic.com. The key is stored only in this browser and
          sent only to Anthropic. Claude gets words and numbers about the course, never the map.
        </p>
      </section>
    )
  }

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
      <button type="button" className="link" onClick={forgetKey}>
        Forget API key
      </button>
    </section>
  )
}
