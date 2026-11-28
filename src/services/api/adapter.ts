import type { ApiOptions } from './options.js'
import type { SafetyCheckLevel } from './safety.js'
import type { MessageParam } from './types.js'
import type { ModelProvider } from '../providers/types.js'

/** 与协议无关的一次生成请求；各适配器负责翻译成自家请求体 */
export type ChatRequest = {
  model: string
  system: string
  messages: MessageParam[]
  thinking: boolean
  /** 是否开启联网搜索；仅 DeepSeek 预设支持 */
  search: boolean
  options: ApiOptions
  /** 安全审核级别；仅 DeepSeek 端点生效，'off' 不发送该字段 */
  safetyCheck: SafetyCheckLevel
  /** 是否请求服务端生成会话标题；仅 DeepSeek 预设支持 */
  requestTitle: boolean
}

export type ChatTarget = {
  provider: ModelProvider
  /** 实际使用的密钥，默认取 provider.apiKey */
  apiKey: string
}

/** 拼接 baseUrl 与 apiPath，两边的多余斜杠只保留一个 */
export const joinUrl = (baseUrl: string, apiPath: string): string =>
  `${baseUrl.replace(/\/+$/, '')}/${apiPath.replace(/^\/+/, '')}`

export const isPresetProvider = (target: ChatTarget): boolean =>
  target.provider.preset === 'deepseek'

/**
 * 是否 DeepSeek 官方端点：内置提供商，或 baseUrl 指向官方域名。
 * safety_check 等私有字段只在这里发送，中转站收到未知字段会直接 400。
 */
export const isDeepSeekEndpoint = (provider: ModelProvider): boolean => {
  if (provider.preset === 'deepseek') {
    return true
  }
  try {
    return new URL(provider.baseUrl).hostname === 'api.deepseek.com'
  } catch {
    return false
  }
}
