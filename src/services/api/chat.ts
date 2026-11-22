import { streamAnthropic } from './anthropic.js'
import { streamOpenAI } from './openai.js'
import type { ChatRequest, ChatTarget } from './adapter.js'
import type { MessageStreamEvent } from './types.js'

/** 按提供商协议分发到对应适配器；两者都产出统一的内部流式事件 */
export const streamChat = (
  target: ChatTarget,
  request: ChatRequest,
  signal: AbortSignal
): AsyncGenerator<MessageStreamEvent> =>
  target.provider.protocol === 'openai'
    ? streamOpenAI(target, request, signal)
    : streamAnthropic(target, request, signal)
