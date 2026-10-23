import type { z } from 'zod'

export interface AgentTool {
  readonly name: string
  readonly description: string
  readonly inputSchema: z.ZodType
  readonly run: (input: unknown) => Promise<string>
}

export function defineTool<Schema extends z.ZodType>(tool: {
  name: string
  description: string
  inputSchema: Schema
  run: (input: z.infer<Schema>) => Promise<string>
}): AgentTool {
  return { ...tool, run: async input => tool.run(tool.inputSchema.parse(input)) }
}

export interface ChatOptions {
  readonly systemPrompt: string
  readonly tools: readonly AgentTool[]
}

export interface ChatSession {
  send(userText: string, onText: (delta: string) => void, signal?: AbortSignal): Promise<void>
}

export interface LlmProvider {
  startChat(options: ChatOptions): ChatSession
  describeError(error: unknown): string
}
