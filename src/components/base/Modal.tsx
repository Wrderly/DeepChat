import clsx from 'clsx'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslate } from '../../i18n/index.js'
import { useIsMobile } from '../../app/viewport.js'
import { useDragDismiss } from './dragDismiss.js'
import { IconCloseOutline16 } from './icons.js'
import { IconButton } from './IconButton.js'
import styles from './Modal.module.css'

/** 当前打开的弹窗，后打开的在末尾；叠放时 Esc 只关闭最上层 */
const openModals: object[] = []

/**
 * 遮罩 + 居中卡片，Esc / 点遮罩关闭。
 * 打开时淡入放大；调用方在关闭后继续渲染并传 `closing`，即可播完收起过渡。
 */
export const Modal = ({
  title,
  children,
  footer,
  closable = false,
  closing = false,
  dragToClose = false,
  className,
  mainClassName,
  onClose,
}: {
  title: ReactNode
  children?: ReactNode
  footer?: ReactNode
  /** 标题栏右侧显示关闭按钮 */
  closable?: boolean
  /** 正在播放关闭过渡，调用方负责在过渡结束后卸载 */
  closing?: boolean
  /** 移动端可按住标题栏下拉关闭 */
  dragToClose?: boolean
  className?: string
  /** 内容区的 class */
  mainClassName?: string
  onClose: () => void
}) => {
  const t = useTranslate()
  const titleId = useId()
  const isMobile = useIsMobile()
  const [entered, setEntered] = useState(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const token = {}
    openModals.push(token)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && openModals.at(-1) === token) {
        onCloseRef.current()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      openModals.splice(openModals.indexOf(token), 1)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const drag = useDragDismiss({
    direction: 'down',
    onDismiss: onClose,
  })
  const draggable = dragToClose && isMobile && !closing

  return createPortal(
    <div
      className={clsx(styles.overlay, entered && !closing && styles.overlayVisible)}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        className={clsx(
          styles.content,
          className,
          entered && !closing && styles.contentVisible,
          draggable && drag.dragging && styles.contentDragging
        )}
        style={draggable ? drag.style : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.header} {...(draggable ? drag.handlers : undefined)}>
          <div id={titleId} className={styles.title}>
            {title}
          </div>
          {closable ? (
            <IconButton
              className={styles.close}
              tone="primary"
              icon={<IconCloseOutline16 />}
              aria-label={t('close')}
              onClick={onClose}
            />
          ) : null}
        </div>
        {children ? <div className={clsx(styles.main, mainClassName)}>{children}</div> : null}
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>,
    document.body
  )
}
