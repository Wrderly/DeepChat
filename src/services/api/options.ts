/**
 * 生成参数（思考强度、温度、核采样、输出上限、停止序列）的应用内表示。
 * null 表示不传该字段，由服务端按模型与思考模式决定；设置页保存默认值，会话可整体覆盖。
 */
import type { CreateMessageRequest, ThinkingEffort } from './types.js'

export type ApiOptions = {
  /** 思考强度（output_config.effort） */
  effort: ThinkingEffort | null
  /** 采样温度 0–2 */
  temperature: number | null
  /** 核采样大于 0 且不超过 1 */
  topP: number | null
  /** 单轮输出上限，包含思考 token */
  maxTokens: number | null
  /** 停止序列，命中任一条即停止生成 */
  stopSequences: string[]
}

/** 全部不传：与没有这项设置时的请求完全一致 */
export const DEFAULT_API_OPTIONS: ApiOptions = {
  effort: null,
  temperature: null,
  topP: null,
  maxTokens: null,
  stopSequences: [],
}

const EFFORTS: readonly ThinkingEffort[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'ultra',
  'max',
]

/** 接口上限：停止序列最多 16 条、每条不超过 512 字节（UTF-8） */
export const MAX_STOP_SEQUENCES = 16
const MAX_STOP_SEQUENCE_BYTES = 512
const encoder = new TextEncoder()

/** 按 UTF-8 字节截断，避免把多字节字符截成半个字 */
const truncateBytes = (value: string): string => {
  if (encoder.encode(value).length <= MAX_STOP_SEQUENCE_BYTES) {
    return value
  }
  let bytes = 0
  let result = ''
  for (const char of value) {
    const size = encoder.encode(char).length
    if (bytes + size > MAX_STOP_SEQUENCE_BYTES) {
      break
    }
    bytes += size
    result += char
  }
  return result
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const toNumber = (value: unknown, min: number, max: number): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : null

const toMaxTokens = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.round(value)) : null

/** 逐行解析停止序列：去掉空行，超出上限的部分丢弃 */
export const parseStopSequences = (text: string): string[] =>
  text
    .split('\n')
    .map((item) => item.trim())
    .filter((item) => item !== '')
    .slice(0, MAX_STOP_SEQUENCES)
    .map(truncateBytes)

const toStopSequences = (value: unknown): string[] =>
  Array.isArray(value)
    ? parseStopSequences(
        value.filter((item): item is string => typeof item === 'string').join('\n')
      )
    : []

/** 规整来自 localStorage 或历史数据里的参数，非法值按「不传」处理 */
export const normalizeApiOptions = (value: unknown): ApiOptions => {
  const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  return {
    effort: EFFORTS.find((item) => item === source.effort) ?? null,
    temperature: toNumber(source.temperature, 0, 2),
    // 接口要求 top_p > 0 且 ≤ 1，滑块从 0.01 起
    topP: toNumber(source.topP, 0.01, 1),
    maxTokens: toMaxTokens(source.maxTokens),
    stopSequences: toStopSequences(source.stopSequences),
  }
}

/** 解析 localStorage 里保存的 JSON；缺失或损坏时使用「全部不传」 */
export const parseApiOptions = (raw: string | null): ApiOptions => {
  if (!raw) {
    return DEFAULT_API_OPTIONS
  }
  try {
    return normalizeApiOptions(JSON.parse(raw))
  } catch {
    return DEFAULT_API_OPTIONS
  }
}

type RequestParams = Pick<
  CreateMessageRequest,
  'output_config' | 'temperature' | 'top_p' | 'max_tokens' | 'stop_sequences'
>

/** 只带出设置过的字段；思考强度仅在开启深度思考时生效 */
export const toRequestParams = (options: ApiOptions, thinking: boolean): RequestParams => ({
  ...(thinking && options.effort !== null ? { output_config: { effort: options.effort } } : {}),
  ...(options.temperature !== null ? { temperature: options.temperature } : {}),
  ...(options.topP !== null ? { top_p: options.topP } : {}),
  ...(options.maxTokens !== null ? { max_tokens: options.maxTokens } : {}),
  ...(options.stopSequences.length > 0 ? { stop_sequences: options.stopSequences } : {}),
})
