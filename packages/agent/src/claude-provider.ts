import Anthropic from '@anthropic-ai/sdk'
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { ChatOptions, ChatSession, LlmProvider } from './llm-provider'

export const CLAUDE_MODEL = 'claude-opus-5-5'
const MAX_OUTPUT_TOKENS = 64000

export class TruncatedToolCallError extends Error {}

export function createClaudeProvider(apiKey: string): LlmProvider {
  // The user's own key, kept in their browser (D3, D4: no backend to proxy through).
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  return {
    startChat({ systemPrompt, tools }: ChatOptions): ChatSession {
      let history: Anthropic.Beta.BetaMessageParam[] = []
      const runnableTools = tools.map(tool =>
        betaZodTool({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          run: input => tool.run(input),
        }),
      )

      return {
        async send(userText, onText, signal) {
          const runner = client.beta.messages.toolRunner(
            {
              model: CLAUDE_MODEL,
              max_tokens: MAX_OUTPUT_TOKENS,
              system: systemPrompt,
              tools: runnableTools,
              messages: [...history, { role: 'user', content: userText }],
              output_config: { effort: 'medium' },
              cache_control: { type: 'ephemeral' },
              betas: ['server-side-fallback-2026-07-01'],
              fallbacks: 'default',
              stream: true,
            },
            signal ? { signal } : undefined,
          )

          let hasWrittenText = false
          for await (const stream of runner) {
            let isFirstDeltaOfReply = true
            for await (const event of stream) {
              if (event.type !== 'content_block_delta' || event.delta.type !== 'text_delta')
                continue
              if (isFirstDeltaOfReply && hasWrittenText) onText('\n\n')
              isFirstDeltaOfReply = false
              hasWrittenText = true
              onText(event.delta.text)
            }
            const message = await stream.finalMessage()
            const hasToolCall = message.content.some(block => block.type === 'tool_use')
            if (message.stop_reason === 'max_tokens' && hasToolCall) {
              throw new TruncatedToolCallError(
                'The reply was cut off in the middle of a tool call.',
              )
            }
            if (message.stop_reason === 'refusal') {
              onText(`${hasWrittenText ? '\n\n' : ''}(Claude declined to answer this.)`)
              break
            }
          }
          history = runner.params.messages
        },
      }
    },

    describeError(error) {
      if (error instanceof Anthropic.APIUserAbortError) return 'Stopped.'
      if (error instanceof Anthropic.AuthenticationError)
        return 'Claude did not accept the API key. Check the key and save it again.'
      if (error instanceof Anthropic.RateLimitError)
        return 'Too many requests to Claude. Wait a moment and try again.'
      if (error instanceof Anthropic.APIConnectionError)
        return 'Could not reach Claude. Check the internet connection.'
      if (error instanceof Anthropic.APIError)
        return `Claude API error ${error.status}: ${error.message}`
      return error instanceof Error ? error.message : String(error)
    },
  }
}
