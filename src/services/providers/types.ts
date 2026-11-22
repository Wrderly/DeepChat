/** 'anthropic' = Anthropic Messages API；'openai' = OpenAI Chat Completions API */
export type ApiProtocol = 'anthropic' | 'openai'

/**
 * deepseek：内置 DeepSeek，启用 Files API、语音、搜索、服务端标题等私有扩展。
 * custom：只使用标准协议字段。
 */
export type ProviderPreset = 'deepseek' | 'custom'

export type ModelCapability = 'thinking' | 'vision' | 'document' | 'prefill'

export type ProviderModel = {
  /** 请求体里的 model 字段 */
  id: string
  /** 选择器里显示的名字 */
  name: string
  capabilities: ModelCapability[]
}

export type ModelProvider = {
  id: string
  name: string
  protocol: ApiProtocol
  /** 例如 https://api.deepseek.com */
  baseUrl: string
  /** 例如 /anthropic/v1/messages、/v1/chat/completions */
  apiPath: string
  apiKey: string
  preset: ProviderPreset
  models: ProviderModel[]
  defaultModelId: string | null
  /** 少数服务需要额外请求头，如 OpenRouter 的 HTTP-Referer */
  extraHeaders?: Record<string, string>
  /** 少数服务需要额外请求体字段，如 enable_thinking */
  extraBody?: Record<string, unknown>
  createdAt: number
}

/** 消息与会话里保存的模型快照；提供商被删除后仍能显示原名 */
export type ModelRef = {
  providerId: string
  modelId: string
  providerName?: string
  modelName?: string
}
