import type { Session } from '../chat/types.js'
import { DEEPSEEK_PROVIDER_ID } from './constants.js'
import { useProviders } from './store.js'
import type { ModelCapability, ModelProvider, ModelRef, ProviderModel } from './types.js'

export type ResolvedModel = {
  provider: ModelProvider
  model: ProviderModel
}

export const findProvider = (providerId: string | null | undefined): ModelProvider | null => {
  if (!providerId) {
    return null
  }
  return useProviders.getState().items.find((provider) => provider.id === providerId) ?? null
}

export const modelSupports = (
  model: ProviderModel | null | undefined,
  capability: ModelCapability
): boolean => Boolean(model?.capabilities.includes(capability))

export const isDeepSeekProvider = (provider: ModelProvider | null | undefined): boolean =>
  provider?.preset === 'deepseek' || provider?.id === DEEPSEEK_PROVIDER_ID

export const toModelRef = (provider: ModelProvider, model: ProviderModel): ModelRef => ({
  providerId: provider.id,
  modelId: model.id,
  providerName: provider.name,
  modelName: model.name,
})

/**
 * 把快照解析成当前可用的提供商与模型。
 * 模型被删除时退回该提供商的默认模型；提供商被删除时返回 null。
 */
export const resolveModel = (ref: ModelRef | null | undefined): ResolvedModel | null => {
  const provider = findProvider(ref?.providerId)
  if (!provider || provider.models.length === 0) {
    return null
  }
  const model =
    provider.models.find((item) => item.id === ref?.modelId) ??
    provider.models.find((item) => item.id === provider.defaultModelId) ??
    provider.models[0]
  return model ? { provider, model } : null
}

/** 全局默认模型：默认提供商 → 其默认模型 */
export const defaultModelRef = (): ModelRef | null => {
  const { items, defaultProviderId } = useProviders.getState()
  const provider =
    items.find((item) => item.id === defaultProviderId) ??
    items.find((item) => item.apiKey) ??
    items[0]
  if (!provider) {
    return null
  }
  const model =
    provider.models.find((item) => item.id === provider.defaultModelId) ?? provider.models[0]
  return model ? toModelRef(provider, model) : null
}

/** 会话使用的模型：会话快照优先，失效时退回全局默认 */
export const sessionModelRef = (session: Session | null | undefined): ModelRef | null =>
  resolveModel(session?.model) ? (session?.model ?? null) : defaultModelRef()

/** 语音（ASR/TTS）与搜索扩展只在内置 DeepSeek 提供商下可用 */
export const deepSeekProvider = (): ModelProvider | null =>
  useProviders.getState().items.find((provider) => provider.id === DEEPSEEK_PROVIDER_ID) ?? null

export const deepSeekApiKey = (): string => deepSeekProvider()?.apiKey ?? ''

/** 历史消息里没有可用提供商时，用快照里的名字兜底显示 */
export const modelRefLabel = (ref: ModelRef | null | undefined): string => {
  if (!ref) {
    return ''
  }
  const provider = findProvider(ref.providerId)
  const resolved = provider ? resolveModel(ref) : null
  const modelName =
    resolved?.model.name ??
    ref.modelName ??
    provider?.models.find((m) => m.id === ref.modelId)?.name
  const providerName = provider?.name ?? ref.providerName
  return [providerName, modelName ?? ref.modelId].filter(Boolean).join(' / ')
}
