import { API_ORIGIN } from '../api/client.js'
import type { ApiProtocol, ModelProvider, ProviderModel } from './types.js'

/** 内置 DeepSeek 提供商的固定 id，历史消息快照与迁移都依赖它 */
export const DEEPSEEK_PROVIDER_ID = 'deepseek'

export const PROVIDERS_STORAGE_KEY = 'deepchat:providers'

/** 新增提供商时按协议给出的默认地址 */
export const PROTOCOL_DEFAULTS: Record<ApiProtocol, { baseUrl: string; apiPath: string }> = {
  anthropic: { baseUrl: 'https://api.anthropic.com', apiPath: '/v1/messages' },
  openai: { baseUrl: 'https://api.openai.com', apiPath: '/v1/chat/completions' },
}

const DEEPSEEK_MODELS: ProviderModel[] = [
  {
    id: 'deepseek-flash',
    name: 'DeepSeek Flash',
    capabilities: ['thinking', 'vision', 'document', 'prefill'],
  },
  {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    capabilities: ['thinking', 'document', 'prefill'],
  },
]

/** 内置提供商不允许删除，只允许改密钥、改名与模型列表 */
export const createDeepSeekProvider = (apiKey = ''): ModelProvider => ({
  id: DEEPSEEK_PROVIDER_ID,
  name: 'DeepSeek',
  protocol: 'anthropic',
  baseUrl: API_ORIGIN,
  apiPath: '/anthropic/v1/messages',
  apiKey,
  preset: 'deepseek',
  models: DEEPSEEK_MODELS.map((model) => ({ ...model, capabilities: [...model.capabilities] })),
  defaultModelId: DEEPSEEK_MODELS[0]?.id ?? null,
  createdAt: 0,
})
