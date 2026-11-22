import { joinUrl } from '../api/adapter.js'
import { API_ORIGIN, request } from '../api/client.js'
import { DEEPSEEK_PROVIDER_ID } from './constants.js'
import type { ModelProvider } from './types.js'

/** 模型列表端点：内置 DeepSeek 用公开的 /models，其余由聊天路径推导，例如 /v1/chat/completions → /v1/models */
export const providerModelsUrl = (provider: ModelProvider): string => {
  if (provider.id === DEEPSEEK_PROVIDER_ID) {
    return `${API_ORIGIN}/models`
  }
  const base = provider.apiPath
    .replace(/\/(messages|chat\/completions)\/?$/, '')
    .replace(/\/+$/, '')
  return joinUrl(provider.baseUrl, `${base}/models`)
}

const authHeaders = (provider: ModelProvider): Record<string, string> => {
  if (provider.id === DEEPSEEK_PROVIDER_ID || provider.protocol === 'openai') {
    return { Authorization: `Bearer ${provider.apiKey}` }
  }
  return {
    'x-api-key': provider.apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  }
}

/**
 * 拉取服务端的模型列表，同时用来验证密钥。
 * 兼容 OpenAI 的 { data: [{ id }] }、Anthropic 的 { data: [...] } 与 { models: [...] }。
 */
export const fetchProviderModels = async (
  provider: ModelProvider,
  signal?: AbortSignal
): Promise<string[]> => {
  const response = await request(providerModelsUrl(provider), {
    headers: authHeaders(provider),
    signal,
  })
  const body: unknown = await response.json()
  const entries =
    typeof body === 'object' && body !== null
      ? Array.isArray((body as { data?: unknown }).data)
        ? (body as { data: unknown[] }).data
        : Array.isArray((body as { models?: unknown }).models)
          ? (body as { models: unknown[] }).models
          : []
      : []
  const ids: string[] = []
  for (const entry of entries) {
    if (typeof entry === 'string' && entry) {
      ids.push(entry)
    } else if (
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as { id?: unknown }).id === 'string'
    ) {
      const id = (entry as { id: string }).id
      if (id) {
        ids.push(id)
      }
    }
  }
  return ids
}
