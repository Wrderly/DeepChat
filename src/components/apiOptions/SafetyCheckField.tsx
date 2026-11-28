import clsx from 'clsx'
import { SAFETY_CHECK_LEVELS, type SafetyCheckLevel } from '../../services/api/safety.js'
import { useTranslate, type TranslationKey } from '../../i18n/index.js'
import styles from './ApiOptions.module.css'

const LEVEL_LABELS: Record<SafetyCheckLevel, TranslationKey> = {
  high: 'safetyCheckHigh',
  low: 'safetyCheckLow',
  off: 'safetyCheckOff',
}

/**
 * 安全审核级别选择：设置页选新对话的默认值，会话浮层多一个「跟随默认」。
 * 该字段只在 DeepSeek 端点发送，调用方用 disabled 表示当前模型不会生效。
 */
export const SafetyCheckField = ({
  value,
  onChange,
  followDefault = false,
  disabled = false,
  hideLabel = false,
  hint,
}: {
  /** 当前值；followDefault 为真时 undefined 表示跟随设置页默认值 */
  value: SafetyCheckLevel | undefined
  onChange: (next: SafetyCheckLevel | undefined) => void
  followDefault?: boolean
  disabled?: boolean
  /** 外层已有分组标题时隐藏自身的标签，避免重复 */
  hideLabel?: boolean
  hint?: string
}) => {
  const t = useTranslate()
  return (
    <div className={styles.field}>
      {hideLabel ? null : (
        <div className={styles.fieldHead}>
          <span className={styles.fieldLabel}>{t('safetyCheckTitle')}</span>
        </div>
      )}
      <div
        className={styles.segments}
        role="radiogroup"
        aria-label={t('safetyCheckTitle')}
        aria-disabled={disabled}
      >
        {followDefault ? (
          <button
            type="button"
            role="radio"
            aria-checked={value === undefined}
            className={clsx(styles.segment, value === undefined && styles.segmentActive)}
            disabled={disabled}
            onClick={() => onChange(undefined)}
          >
            {t('safetyCheckFollowDefault')}
          </button>
        ) : null}
        {SAFETY_CHECK_LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={value === level}
            className={clsx(styles.segment, value === level && styles.segmentActive)}
            disabled={disabled}
            onClick={() => onChange(level)}
          >
            {t(LEVEL_LABELS[level])}
          </button>
        ))}
      </div>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  )
}
