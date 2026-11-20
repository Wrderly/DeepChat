import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useAnchoredPosition, useDismiss } from '../base/anchored.js'
import { setSessionApiOptions, useChatStore } from '../../services/chat/store.js'
import { useSettings } from '../../services/settings.js'
import type { ApiOptions } from '../../services/api/options.js'
import { useTranslate } from '../../i18n/index.js'
import { ApiOptionsControls } from './ApiOptionsControls.js'
import styles from './ApiOptions.module.css'

/**
 * 会话级生成参数浮层：向上展开在触发的开关上方。
 * 会话没有覆盖值时展示设置页的默认值，改动后整组参数保存到该会话，「恢复默认」回到跟随默认值。
 */
export const ApiOptionsPanel = ({
  sessionId,
  children,
}: {
  sessionId: string
  children: (props: { open: boolean; toggle: () => void; customized: boolean }) => ReactNode
}) => {
  const t = useTranslate()
  const [open, setOpen] = useState(false)
  const defaults = useSettings((state) => state.apiOptions)
  const thinking = useSettings((state) => state.thinking)
  const options = useChatStore((state): ApiOptions | undefined => {
    const session = state.sessionCache[sessionId]
    return session ? session.options : undefined
  })
  const { anchorRef, floatingRef, position } = useAnchoredPosition<HTMLSpanElement, HTMLDivElement>(
    open,
    { side: 'top', align: 'start', offset: 8 }
  )
  useDismiss(open, [anchorRef, floatingRef], () => setOpen(false), { captureEscape: true })
  const customized = options !== undefined
  return (
    <>
      <span ref={anchorRef} className={styles.anchor}>
        {children({ open, toggle: () => setOpen((value) => !value), customized })}
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
                    onClick={() => setSessionApiOptions(sessionId, undefined)}
                  >
                    {t('apiOptionsReset')}
                  </button>
                ) : null}
              </div>
              <ApiOptionsControls
                value={options ?? defaults}
                thinking={thinking}
                onChange={(next) => setSessionApiOptions(sessionId, next)}
              />
              <p className={styles.panelNote}>
                {customized ? t('apiOptionsCustomized') : t('apiOptionsFollowDefaults')}
              </p>
            </div>,
            document.body
          )
        : null}
    </>
  )
}
