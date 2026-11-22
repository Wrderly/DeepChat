import { ApiError, readErrorResponse, request } from './client.js'
import { joinUrl, type ChatRequest, type ChatTarget } from './adapter.js'
import { toOpenAIBody, type OpenAIChunk } from './convert.js'
import { readServerSentEvents } from './sse.js'
import type { MessageStreamEvent, MessageUsage, StopReason } from './types.js'

const mapFinishReason = (reason: string | null | undefined): StopReason => {
  switch (reason) {
    case 'length':
      return 'max_tokens'
    case 'tool_calls':
    case 'function_call':
      return 'tool_use'
    case 'content_filter':
      return 'refusal'
    default:
      return 'end_turn'
  }
}

const toUsage = (usage: OpenAIChunk['usage']): MessageUsage => ({
  input_tokens: usage?.prompt_tokens ?? 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
  output_tokens: usage?.completion_tokens ?? 0,
})

/**
 * POST {baseUrl}{apiPath}（OpenAI Chat Completions 兼容），把 SSE 增量翻译成内部流式事件。
 * 思考内容兼容 reasoning_content（DeepSeek 等）与 reasoning（OpenRouter 等）两种字段。
 */
export async function* streamOpenAI(
  target: ChatTarget,
  chatRequest: ChatRequest,
  signal: AbortSignal
): AsyncGenerator<MessageStreamEvent> {
  const body = toOpenAIBody(chatRequest, chatRequest.model, target.provider.extraBody)
  const url = joinUrl(target.provider.baseUrl, target.provider.apiPath)
  const headers: Record<string, string> = {
    Authorization: `Bearer ${target.apiKey}`,
    'content-type': 'application/json',
    accept: 'text/event-stream',
    ...target.provider.extraHeaders,
  }
  const post = () => request(url, { method: 'POST', headers, body: JSON.stringify(body), signal })

  let response: Response
  try {
    response = await post()
  } catch (error) {
    // 部分兼容服务不支持 stream_options，去掉后重试一次
    if (error instanceof ApiError && error.status === 400 && /stream_options/.test(error.message)) {
      delete body.stream_options
      response = await post()
    } else {
      throw error
    }
  }

  const contentType = response.headers.get('Content-Type') ?? ''
  if (!response.body || !contentType.includes('text/event-stream')) {
    throw await readErrorResponse(response, 'protocol', '')
  }

  let started = false
  let nextIndex = 0
  let thinkingIndex = -1
  let textIndex = -1
  let stopReason: StopReason = 'end_turn'
  let usage: MessageUsage | undefined

  for await (const { data } of readServerSentEvents(response.body, signal)) {
    if (data === '[DONE]') {
      break
    }
    let chunk: OpenAIChunk
    try {
      chunk = JSON.parse(data) as OpenAIChunk
    } catch {
      continue
    }
    if (!started) {
      started = true
      yield {
        type: 'message_start',
        message: {
          id: chunk.id ?? '',
          model: chunk.model ?? chatRequest.model,
          ...(chunk.usage ? { usage: toUsage(chunk.usage) } : {}),
        },
      }
    }
    if (chunk.usage) {
      usage = toUsage(chunk.usage)
    }
    const choice = chunk.choices?.[0]
    if (!choice) {
      continue
    }
    const reasoning = choice.delta?.reasoning_content ?? choice.delta?.reasoning ?? ''
    if (reasoning) {
      if (thinkingIndex < 0) {
        thinkingIndex = nextIndex++
        yield {
          type: 'content_block_start',
          index: thinkingIndex,
          content_block: { type: 'thinking', thinking: '', signature: '' },
        }
      }
      yield {
        type: 'content_block_delta',
        index: thinkingIndex,
        delta: { type: 'thinking_delta', thinking: reasoning },
      }
    }
    const text = choice.delta?.content ?? ''
    if (text) {
      if (textIndex < 0) {
        textIndex = nextIndex++
        yield {
          type: 'content_block_start',
          index: textIndex,
          content_block: { type: 'text', text: '' },
        }
      }
      yield {
        type: 'content_block_delta',
        index: textIndex,
        delta: { type: 'text_delta', text },
      }
    }
    if (choice.finish_reason) {
      stopReason = mapFinishReason(choice.finish_reason)
    }
  }

  if (!started) {
    throw new ApiError('protocol', 'Empty stream')
  }
  if (thinkingIndex >= 0) {
    yield { type: 'content_block_stop', index: thinkingIndex }
  }
  if (textIndex >= 0) {
    yield { type: 'content_block_stop', index: textIndex }
  }
  yield {
    type: 'message_delta',
    delta: { stop_reason: stopReason, stop_sequence: null },
    ...(usage ? { usage } : {}),
  }
  yield { type: 'message_stop' }
}
