import { toRequestParams } from './options.js'
import { readMessageEvent } from './parseEvent.js'
import { ApiError, FILES_BETA, readErrorResponse, request } from './client.js'
import { readServerSentEvents } from './sse.js'
import { isPresetProvider, joinUrl, type ChatRequest, type ChatTarget } from './adapter.js'
import type { CreateMessageRequest, MessageParam, MessageStreamEvent } from './types.js'

/** Anthropic 协议的 max_tokens 是必填项；DeepSeek 预设不传，沿用服务端默认 */
const DEFAULT_MAX_TOKENS = 4096

const serverTools = (search: boolean): CreateMessageRequest['tools'] => [
  { type: 'deepseek_read_url', name: 'deepseek_read_url' },
  ...(search
    ? [{ type: 'deepseek_web_search' as const, name: 'deepseek_web_search' as const }]
    : []),
]

/** 非 DeepSeek 服务不认识 latest_reminder 角色，把内容并进 system 末尾 */
const mergeReminder = (
  messages: MessageParam[],
  system: string
): { messages: MessageParam[]; system: string } => {
  const reminders: string[] = []
  const rest = messages.filter((message) => {
    if (message.role === 'latest_reminder') {
      reminders.push(message.content)
      return false
    }
    return true
  })
  if (reminders.length === 0) {
    return { messages, system }
  }
  return {
    messages: rest,
    system: [system, ...reminders].filter(Boolean).join('\n\n'),
  }
}

const hasFile = (messages: MessageParam[]): boolean =>
  messages.some(
    (message) =>
      typeof message.content !== 'string' &&
      message.content.some((block) => block.type === 'image' || block.type === 'document')
  )

/**
 * POST {baseUrl}{apiPath}（Anthropic Messages 兼容），逐个产出内部流式事件。
 * 内置 DeepSeek 额外发送 safety_check、工具与标题扩展；自定义提供商只发送标准字段。
 */
export async function* streamAnthropic(
  target: ChatTarget,
  chatRequest: ChatRequest,
  signal: AbortSignal
): AsyncGenerator<MessageStreamEvent> {
  const preset = isPresetProvider(target)
  const { messages, system } = preset
    ? { messages: chatRequest.messages, system: chatRequest.system }
    : mergeReminder(chatRequest.messages, chatRequest.system)
  const body: CreateMessageRequest = {
    model: chatRequest.model,
    system,
    messages,
    thinking: { type: chatRequest.thinking ? 'enabled' : 'disabled' },
    ...toRequestParams(chatRequest.options, chatRequest.thinking),
    ...(preset
      ? {
          safety_check: { level: 'high' as const },
          tools: serverTools(chatRequest.search),
          ...(chatRequest.requestTitle ? { title: { enabled: true } } : {}),
        }
      : {}),
    ...target.provider.extraBody,
  }
  if (!preset) {
    body.max_tokens ??= DEFAULT_MAX_TOKENS
  }

  const headers: Record<string, string> = {
    'x-api-key': target.apiKey,
    'content-type': 'application/json',
    accept: 'text/event-stream',
    // Anthropic 官方要求版本头与浏览器直连开关；其他兼容服务会忽略未知头
    ...(preset
      ? {}
      : {
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        }),
    ...(preset && hasFile(messages) ? { 'anthropic-beta': FILES_BETA } : {}),
    ...target.provider.extraHeaders,
  }
  const response = await request(joinUrl(target.provider.baseUrl, target.provider.apiPath), {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...body, stream: true }),
    signal,
  })
  const contentType = response.headers.get('Content-Type') ?? ''
  if (!response.body || !contentType.includes('text/event-stream')) {
    throw await readErrorResponse(response, 'protocol', '')
  }
  for await (const { event: eventName, data } of readServerSentEvents(response.body, signal)) {
    let payload: unknown
    try {
      payload = JSON.parse(data)
    } catch {
      if (eventName !== 'error') {
        continue
      }
    }
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'error' in payload &&
      typeof (payload as { error?: { message?: unknown } }).error?.message === 'string'
    ) {
      throw new ApiError('stream', (payload as { error: { message: string } }).error.message)
    }
    if (eventName === 'error') {
      throw new ApiError('stream', data)
    }
    const event = readMessageEvent(payload)
    if (!event) {
      continue
    }
    yield event
    if (event.type === 'message_stop') {
      return
    }
  }
  // 服务端没有提供错误内容时保持为空，不推测断流原因。
  throw new ApiError('interrupted', '')
}
