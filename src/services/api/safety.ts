/**
 * DeepSeek 安全审核级别（请求体里的 safety_check.level）。
 * 'off' 不发送该字段：服务端仍按默认策略检查内容，与 'low' 的效果相同，区别只在字段是否出现；
 * 只有 'high' 会额外审核输入输出，可能直接拒答。
 */
export type SafetyCheckLevel = 'high' | 'low' | 'off'

export const SAFETY_CHECK_LEVELS: readonly SafetyCheckLevel[] = ['high', 'low', 'off']

/** 未知值收敛为 undefined，由调用方决定是回退到默认值还是当作未设置 */
export const normalizeSafetyCheckLevel = (value: unknown): SafetyCheckLevel | undefined =>
  SAFETY_CHECK_LEVELS.find((level) => level === value)

/** 要拼进请求体的字段；'off' 返回空对象，请求体里不会出现 safety_check */
export const toSafetyCheckFields = (
  level: SafetyCheckLevel
): { safety_check?: { level: 'high' | 'low' } } => (level === 'off' ? {} : { safety_check: { level } })
