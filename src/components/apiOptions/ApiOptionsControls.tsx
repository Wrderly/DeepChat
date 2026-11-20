import clsx from 'clsx'
import { useEffect, useState } from 'react'
import {
  MAX_STOP_SEQUENCES,
  parseStopSequences,
  type ApiOptions,
} from '../../services/api/options.js'
import type { ThinkingEffort } from '../../services/api/types.js'
import { useTranslate, type TranslationKey } from '../../i18n/index.js'
import styles from './ApiOptions.module.css'

/** 可选的思考强度：只有 low / high / max 三档互不相同的语义，其余取值是别名 */
const efforts: { value: ThinkingEffort | null; label: TranslationKey }[] = [
  { value: null, label: 'apiOptionsDefault' },
  { value: 'low', label: 'apiOptionsEffortLow' },
  { value: 'high', label: 'apiOptionsEffortHigh' },
  { value: 'max', label: 'apiOptionsEffortMax' },
]

/**
 * 生成参数编辑器：设置页编辑默认值，输入框浮层编辑当前会话的覆盖值。
 * hints 在设置页展开每个参数的说明，浮层里省略以节省高度。
 */
export const ApiOptionsControls = ({
  value,
  onChange,
  hints = false,
  thinking,
}: {
  value: ApiOptions
  onChange: (next: ApiOptions) => void
  hints?: boolean
  /** 当前深度思考开关；关闭时提示思考强度不生效 */
  thinking?: boolean
}) => {
  const t = useTranslate()
  const update = (patch: Partial<ApiOptions>) => onChange({ ...value, ...patch })
  return (
    <div className={styles.fields}>
      <div className={styles.field}>
        <div className={styles.fieldHead}>
          <span className={styles.fieldLabel}>{t('apiOptionsEffort')}</span>
        </div>
        <div className={styles.segments} role="radiogroup" aria-label={t('apiOptionsEffort')}>
          {efforts.map((option) => (
            <button
              key={option.value ?? 'default'}
              type="button"
              role="radio"
              aria-checked={value.effort === option.value}
              className={clsx(
                styles.segment,
                value.effort === option.value && styles.segmentActive
              )}
              onClick={() => update({ effort: option.value })}
            >
              {t(option.label)}
            </button>
          ))}
        </div>
        {hints ? (
          <p className={styles.hint}>
            {thinking === false ? t('apiOptionsEffortDisabled') : t('apiOptionsEffortHint')}
          </p>
        ) : null}
      </div>
      <SliderField
        label={t('apiOptionsTemperature')}
        hint={hints ? t('apiOptionsTemperatureHint') : undefined}
        value={value.temperature}
        fallback={1}
        min={0}
        max={2}
        step={0.05}
        onChange={(temperature) => update({ temperature })}
      />
      <SliderField
        label={t('apiOptionsTopP')}
        hint={hints ? t('apiOptionsTopPHint') : undefined}
        value={value.topP}
        fallback={1}
        min={0.01}
        max={1}
        step={0.01}
        onChange={(topP) => update({ topP })}
      />
      <div className={styles.field}>
        <div className={styles.fieldHead}>
          <span className={styles.fieldLabel}>{t('apiOptionsMaxTokens')}</span>
          <span className={styles.fieldValue}>
            {value.maxTokens === null ? t('apiOptionsDefault') : null}
          </span>
        </div>
        <input
          type="number"
          inputMode="numeric"
          className={styles.input}
          aria-label={t('apiOptionsMaxTokens')}
          min={1}
          step={1}
          placeholder={t('apiOptionsMaxTokensPlaceholder')}
          value={value.maxTokens ?? ''}
          onChange={(event) => {
            const raw = event.target.value.trim()
            const parsed = Number(raw)
            update({
              maxTokens:
                raw === '' || !Number.isFinite(parsed) ? null : Math.max(1, Math.round(parsed)),
            })
          }}
        />
        {hints ? <p className={styles.hint}>{t('apiOptionsMaxTokensHint')}</p> : null}
      </div>
      <StopSequencesField
        value={value.stopSequences}
        hint={hints ? t('apiOptionsStopSequencesHint') : undefined}
        onChange={(stopSequences) => update({ stopSequences })}
      />
    </div>
  )
}

/** 滑块：未设置时按服务端默认值显示位置，右侧「不传」把字段清回未设置 */
const SliderField = ({
  label,
  hint,
  value,
  fallback,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  hint?: string
  value: number | null
  fallback: number
  min: number
  max: number
  step: number
  onChange: (next: number | null) => void
}) => {
  const t = useTranslate()
  const current = value ?? fallback
  return (
    <div className={styles.field}>
      <div className={styles.fieldHead}>
        <span className={styles.fieldLabel}>{label}</span>
        <span className={styles.fieldValue}>
          {value === null ? t('apiOptionsDefault') : current.toFixed(2)}
        </span>
      </div>
      <div className={styles.fieldRow}>
        <input
          type="range"
          className={styles.slider}
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={current}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        {value === null ? null : (
          <button type="button" className={styles.linkButton} onClick={() => onChange(null)}>
            {t('apiOptionsUnset')}
          </button>
        )}
      </div>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  )
}

/** 停止序列：输入过程保留原始文本（含尚未提交的空行），对外只提交解析后的条目 */
const StopSequencesField = ({
  value,
  hint,
  onChange,
}: {
  value: string[]
  hint?: string
  onChange: (next: string[]) => void
}) => {
  const t = useTranslate()
  const [draft, setDraft] = useState(() => value.join('\n'))
  // 恢复默认或切换会话时同步外部值；比较解析结果，避免吃掉正在输入的空行
  useEffect(() => {
    if (value.join('\n') !== parseStopSequences(draft).join('\n')) {
      setDraft(value.join('\n'))
    }
  }, [draft, value])
  return (
    <div className={styles.field}>
      <div className={styles.fieldHead}>
        <span className={styles.fieldLabel}>{t('apiOptionsStopSequences')}</span>
        <span className={styles.fieldValue}>
          {value.length === 0
            ? t('apiOptionsDefault')
            : `${value.length}/${MAX_STOP_SEQUENCES}`}
        </span>
      </div>
      <textarea
        className={styles.textarea}
        aria-label={t('apiOptionsStopSequences')}
        rows={2}
        placeholder={t('apiOptionsStopSequencesPlaceholder')}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value)
          onChange(parseStopSequences(event.target.value))
        }}
      />
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  )
}
