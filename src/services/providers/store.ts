import { create } from 'zustand'
import { createDeepSeekProvider, DEEPSEEK_PROVIDER_ID, PROVIDERS_STORAGE_KEY } from './constants.js'
import type { ApiProtocol, ModelProvider, ProviderModel } from './types.js'

type ProvidersState = {
  items: ModelProvider[]
  defaultProviderId: string | null
}

/** 新建/编辑时由 UI 提供的字段；id、preset、createdAt 由 store 维护 */
export type ProviderInput = Pick<ModelProvider, 'name' | 'protocol' | 'baseUrl' | 'apiPath'> & {
  apiKey?: string
  models?: ProviderModel[]
  defaultModelId?: string | null
  extraHeaders?: Record<string, string>
  extraBody?: Record<string, unknown>
}

const createId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const isProtocol = (value: unknown): value is ApiProtocol =>
  value === 'anthropic' || value === 'openai'

const normalizeModels = (value: unknown): ProviderModel[] => {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((item): ProviderModel[] => {
    if (typeof item !== 'object' || item === null) {
      return []
    }
    const model = item as Partial<ProviderModel>
    if (typeof model.id !== 'string' || !model.id.trim()) {
      return []
    }
    return [
      {
        id: model.id.trim(),
        name: typeof model.name === 'string' && model.name.trim() ? model.name : model.id,
        capabilities: Array.isArray(model.capabilities) ? model.capabilities : [],
      },
    ]
  })
}

/** 存储的数据可能来自旧版本或被手工改坏，逐字段收敛；内置提供商始终补回 */
const normalizeProvider = (value: unknown): ModelProvider | null => {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const provider = value as Partial<ModelProvider>
  if (typeof provider.id !== 'string' || !provider.id) {
    return null
  }
  const models = normalizeModels(provider.models)
  return {
    id: provider.id,
    name: typeof provider.name === 'string' && provider.name ? provider.name : provider.id,
    protocol: isProtocol(provider.protocol) ? provider.protocol : 'anthropic',
    baseUrl: typeof provider.baseUrl === 'string' ? provider.baseUrl : '',
    apiPath: typeof provider.apiPath === 'string' ? provider.apiPath : '',
    apiKey: typeof provider.apiKey === 'string' ? provider.apiKey : '',
    preset: provider.preset === 'deepseek' ? 'deepseek' : 'custom',
    models,
    defaultModelId:
      typeof provider.defaultModelId === 'string'
        ? provider.defaultModelId
        : (models[0]?.id ?? null),
    extraHeaders: provider.extraHeaders,
    extraBody: provider.extraBody,
    createdAt: typeof provider.createdAt === 'number' ? provider.createdAt : Date.now(),
  }
}

const normalize = (items: ModelProvider[], defaultProviderId: unknown): ProvidersState => {
  const list = items.some((provider) => provider.id === DEEPSEEK_PROVIDER_ID)
    ? items
    : [createDeepSeekProvider(), ...items]
  return {
    items: list,
    defaultProviderId:
      typeof defaultProviderId === 'string' && list.some((item) => item.id === defaultProviderId)
        ? defaultProviderId
        : (list[0]?.id ?? null),
  }
}

const read = (): ProvidersState => {
  try {
    const raw = localStorage.getItem(PROVIDERS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { items?: unknown; defaultProviderId?: unknown }
      const items = Array.isArray(parsed.items)
        ? parsed.items.flatMap((item) => normalizeProvider(item) ?? [])
        : []
      return normalize(items, parsed.defaultProviderId)
    }
  } catch {
    // 存储不可用或内容损坏时退回内置提供商
  }
  return normalize([], null)
}

const write = (state: ProvidersState) => {
  try {
    localStorage.setItem(PROVIDERS_STORAGE_KEY, JSON.stringify({ version: 1, ...state }))
  } catch {
    // 隐私模式下 localStorage 可能不可写；内存状态仍然可用
  }
  useProviders.setState(state)
}

export const useProviders = create<ProvidersState>(read)

const current = () => useProviders.getState()

const withDefault = (models: ProviderModel[], defaultModelId: string | null): string | null =>
  defaultModelId && models.some((model) => model.id === defaultModelId)
    ? defaultModelId
    : (models[0]?.id ?? null)

export const createProvider = (input: ProviderInput): ModelProvider => {
  const models = normalizeModels(input.models ?? [])
  return {
    id: createId(),
    name: input.name.trim(),
    protocol: input.protocol,
    baseUrl: input.baseUrl.trim(),
    apiPath: input.apiPath.trim(),
    apiKey: input.apiKey ?? '',
    preset: 'custom',
    models,
    defaultModelId: withDefault(models, input.defaultModelId ?? null),
    extraHeaders: input.extraHeaders,
    extraBody: input.extraBody,
    createdAt: Date.now(),
  }
}

export const addProvider = (provider: ModelProvider) => {
  const state = current()
  write({
    items: [...state.items, provider],
    defaultProviderId: state.defaultProviderId ?? provider.id,
  })
}

export const updateProvider = (id: string, update: (provider: ModelProvider) => ModelProvider) => {
  const state = current()
  const items = state.items.map((provider) => {
    if (provider.id !== id) {
      return provider
    }
    const next = update(provider)
    const models = normalizeModels(next.models)
    return {
      ...next,
      id: provider.id,
      preset: provider.preset,
      models,
      defaultModelId: withDefault(models, next.defaultModelId),
    }
  })
  write({ items, defaultProviderId: state.defaultProviderId })
}

/** 内置提供商不允许删除，返回是否真的删除了 */
export const removeProvider = (id: string): boolean => {
  if (id === DEEPSEEK_PROVIDER_ID) {
    return false
  }
  const state = current()
  const items = state.items.filter((provider) => provider.id !== id)
  write({
    items,
    defaultProviderId:
      state.defaultProviderId === id ? (items[0]?.id ?? null) : state.defaultProviderId,
  })
  return true
}

export const setDefaultProvider = (id: string) => {
  const state = current()
  if (!state.items.some((provider) => provider.id === id)) {
    return
  }
  write({ ...state, defaultProviderId: id })
}

export const setProviderApiKey = (id: string, apiKey: string) => {
  updateProvider(id, (provider) => ({ ...provider, apiKey }))
}

export const isBuiltinProvider = (provider: ModelProvider) =>
  provider.preset === 'deepseek' || provider.id === DEEPSEEK_PROVIDER_ID
