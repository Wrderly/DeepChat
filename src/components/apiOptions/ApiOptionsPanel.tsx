import clsx from 'clsx'
import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useAnchoredPosition, useDismiss } from '../base/anchored.js'
import { useDragDismiss } from '../base/dragDismiss.js'
import { usePresence } from '../base/presence.js'
import { useSettings } from '../../services/settings.js'
import { useIsMobile } from '../../app/viewport.js'
import type { ApiOptions } from '../../services/api/options.js'
import { useTranslate } from '../../i18n/index.js'
import { ApiOptionsControls } from './ApiOptionsControls.js'
import styles from './ApiOptions.module.css'

/**
 * 会话设置浮层：向上展开在触发的开关上方。
 * 未设置时展示设置页的默认值，改动后整组设置交给调用方保存，「恢复默认」回到跟随默认值。
 */
export const ApiOptionsPanel = ({
  value,
  onChange,
  systemPrompt,
  onSystemPromptChange,
  note,
  children,
}: {
  /** 当前生效的整组生成参数，undefined 表示跟随设置页默认值 */
  value: ApiOptions | undefined
  /** 保存整组生成参数，undefined 表示恢复跟随默认值 */
  onChange: (next: ApiOptions | undefined) => void
  /** 当前会话的系统提示词，undefined 表示使用内置默认提示词 */
  systemPrompt: string | undefined
  /** 保存系统提示词，空字符串表示恢复内置默认提示词 */
  onSystemPromptChange: (next: string) => void
  /** 浮层底部说明，由调用方按作用范围给出 */
  note: string
  children: (props: { open: boolean; toggle: () => void; customized: boolean }) => ReactNode
}) => {
  const t = useTranslate()
  const [open, setOpen] = useState(false)
  const isMobile = useIsMobile()
  const defaults = useSettings((state) => state.apiOptions)
  const thinking = useSettings((state) => state.thinking)
  const { mounted, visible } = usePresence(open, 240)
  const { anchorRef, floatingRef, position } = useAnchoredPosition<HTMLSpanElement, HTMLDivElement>(
    mounted,
    { side: 'top', align: 'start', offset: 8, maxHeight: 560 }
  )
  useDismiss(open, [anchorRef, floatingRef], () => setOpen(false), { captureEscape: true })
  const drag = useDragDismiss({ direction: 'down', onDismiss: () => setOpen(false) })
  const customized = value !== undefined || Boolean(systemPrompt)
  const reset = () => {
    onChange(undefined)
    onSystemPromptChange('')
  }
  return (
    <>
      <span ref={anchorRef} className={styles.anchor}>
        {children({ open, toggle: () => setOpen((current) => !current), customized })}
      </span>
      {mounted
        ? createPortal(
            <div
              ref={floatingRef}
              className={clsx(
                styles.panel,
                visible && styles.panelVisible,
                drag.dragging && styles.panelDragging
              )}
              style={{ ...position, ...(isMobile ? drag.style : undefined) }}
              role="dialog"
              aria-label={t('apiOptionsTitle')}
            >
              <div className={styles.panelHead} {...(isMobile ? drag.handlers : undefined)}>
                <span className={styles.panelTitle}>{t('apiOptionsTitle')}</span>
                {customized ? (
                  <button type="button" className={styles.linkButton} onClick={reset}>
                    {t('apiOptionsReset')}
                  </button>
                ) : null}
              </div>
              <div className={styles.fields}>
                <div className={styles.field}>
                  <div className={styles.fieldHead}>
                    <span className={styles.fieldLabel}>{t('apiOptionsSystemPrompt')}</span>
                  </div>
                  <textarea
                    className={clsx(styles.textarea, styles.promptTextarea)}
                    value={systemPrompt ?? ''}
                    placeholder={t('apiOptionsSystemPromptPlaceholder')}
                    aria-label={t('apiOptionsSystemPrompt')}
                    onChange={(event) => onSystemPromptChange(event.target.value)}
                  />
                </div>
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
