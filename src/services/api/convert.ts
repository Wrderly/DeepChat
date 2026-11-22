import type { ChatRequest } from './adapter.js'
import type { ThinkingEffort } from './types.js'

type OpenAITextPart = { type: 'text'; text: string }
type OpenAIImagePart = { type: 'image_url'; image_url: { url: string } }
type OpenAIContent = string | (OpenAITextPart | OpenAIImagePart)[]

export type OpenAIMessage = {
  role: 'system' | 'user' | 'assistant'
  content: OpenAIContent
}

export type OpenAIChunk = {
  id?: string
  model?: string
  choices?: {
    delta?: {
      content?: string | null
      /** DeepSeek 与部分服务用这个字段返回思考过程 */
      reasoning_content?: string | null
      /** OpenRouter 等用这个字段 */
      reasoning?: string | null
    }
    finish_reason?: string | null
  }[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    prompt_tokens_details?: { cached_tokens?: number }
  }
}

/** 把内部消息转成 Chat Completions 的 messages；无法表达的块直接丢弃 */
export const toOpenAIMessages = (request: ChatRequest): OpenAIMessage[] => {
  const reminders: string[] = []
  const messages: OpenAIMessage[] = []

  for (const message of request.messages) {
    if (message.role === 'latest_reminder') {
      reminders.push(message.content)
      continue
    }
    if (message.role === 'user') {
      if (typeof message.content === 'string') {
        messages.push({ role: 'user', content: message.content })
        continue
      }
      const parts: (OpenAITextPart | OpenAIImagePart)[] = []
      for (const block of message.content) {
        if (block.type === 'text') {
          parts.push({ type: 'text', text: block.text })
        } else if (block.type === 'image' && block.source.type === 'base64') {
          parts.push({
            type: 'image_url',
            image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` },
          })
        }
        // document 与 file_id 引用无法在 Chat Completions 中表达，发送前已被上层拦截
      }
      if (parts.length === 0) {
        continue
      }
      messages.push({
        role: 'user',
        content: parts.every((part) => part.type === 'text')
          ? parts.map((part) => (part as OpenAITextPart).text).join('\n\n')
          : parts,
      })
      continue
    }
    const text = message.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .filter(Boolean)
      .join('')
    if (!text) {
      continue
    }
    messages.push({ role: 'assistant', content: text })
  }

  const system = [request.system, ...reminders].filter(Boolean).join('\n\n')
  return system ? [{ role: 'system', content: system }, ...messages] : messages
}

/** 思考强度映射到 OpenAI 的 reasoning_effort；未设置时不传 */
const mapEffort = (effort: ThinkingEffort | null): string | null => {
  switch (effort) {
    case 'none':
    case 'minimal':
      return 'minimal'
    case 'low':
      return 'low'
    case 'medium':
      return 'medium'
    case 'high':
    case 'xhigh':
    case 'ultra':
    case 'max':
      return 'high'
    default:
      return null
  }
}

export const toOpenAIBody = (
  request: ChatRequest,
  model: string,
  extraBody?: Record<string, unknown>
): Record<string, unknown> => {
  const { options } = request
  const effort = request.thinking ? mapEffort(options.effort) : null
  return {
    model,
    messages: toOpenAIMessages(request),
    stream: true,
    stream_options: { include_usage: true },
    ...(effort ? { reasoning_effort: effort } : {}),
    ...(options.temperature !== null ? { temperature: options.temperature } : {}),
    ...(options.topP !== null ? { top_p: options.topP } : {}),
    ...(options.maxTokens !== null ? { max_tokens: options.maxTokens } : {}),
    ...(options.stopSequences.length > 0 ? { stop: options.stopSequences } : {}),
    ...extraBody,
  }
}
