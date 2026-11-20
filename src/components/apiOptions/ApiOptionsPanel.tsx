import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useAnchoredPosition, useDismiss } from '../base/anchored.js'
import { useSettings } from '../../services/settings.js'
import type { ApiOptions } from '../../services/api/options.js'
import { useTranslate } from '../../i18n/index.js'
import { ApiOptionsControls } from './ApiOptionsControls.js'
import styles from './ApiOptions.module.css'

/**
 * 生成参数浮层：向上展开在触发的开关上方。
 * 没有覆盖值时展示设置页的默认值，改动后整组参数交给调用方保存，「恢复默认」回到跟随默认值。
 */
export const ApiOptionsPanel = ({
  value,
  onChange,
  note,
  children,
}: {
  /** 当前生效的整组参数，undefined 表示跟随设置页默认值 */
  value: ApiOptions | undefined
  /** 保存整组参数，undefined 表示恢复跟随默认值 */
  onChange: (next: ApiOptions | undefined) => void
  /** 浮层底部说明，由调用方按作用范围给出 */
  note: string
  children: (props: { open: boolean; toggle: () => void; customized: boolean }) => ReactNode
}) => {
  const t = useTranslate()
  const [open, setOpen] = useState(false)
  const defaults = useSettings((state) => state.apiOptions)
  const thinking = useSettings((state) => state.thinking)
  const { anchorRef, floatingRef, position } = useAnchoredPosition<HTMLSpanElement, HTMLDivElement>(
    open,
    { side: 'top', align: 'start', offset: 8 }
  )
  useDismiss(open, [anchorRef, floatingRef], () => setOpen(false), { captureEscape: true })
  const customized = value !== undefined
  return (
    <>
      <span ref={anchorRef} className={styles.anchor}>
        {children({ open, toggle: () => setOpen((current) => !current), customized })}
      </span>
      {open
        ? createPortal(
            <div
              ref={floatingRef}
              className={styles.panel}
              style={position ?? undefined}
              role="dialog"
              aria-label={t('apiOptionsTitle')}
            >
              <div className={styles.panelHead}>
                <span className={styles.panelTitle}>{t('apiOptionsTitle')}</span>
                {customized ? (
                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={() => onChange(undefined)}
                  >
                    {t('apiOptionsReset')}
                  </button>
                ) : null}
              </div>
              <ApiOptionsControls
                value={value ?? defaults}
                thinking={thinking}
                onChange={onChange}
              />
              <p className={styles.panelNote}>{note}</p>
            </div>,
            document.body
          )
        : null}
    </>
  )
}
