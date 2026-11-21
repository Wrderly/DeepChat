import { useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'

/** 拖动超过该距离就关闭 */
const DEFAULT_THRESHOLD = 72

type DragDismissOptions = {
  /** 关闭时元素跟随手指的方向：'left' 向左滑、'down' 向下拉 */
  direction: 'left' | 'down'
  onDismiss: () => void
  /** 可用于按屏幕宽度调整阈值，默认 72px */
  threshold?: number
}

/**
 * 让浮层跟随手指移动，松手时超过阈值就关闭。
 *
 * 返回的 `style` 只在实际拖动时带 transform（拖动中不参与 CSS 过渡），
 * 松手后清空，交回组件自己的展开/收起过渡。
 */
export const useDragDismiss = ({ direction, onDismiss, threshold = DEFAULT_THRESHOLD }: DragDismissOptions) => {
  const [offset, setOffset] = useState(0)
  const startRef = useRef<{ pointerId: number; origin: number } | null>(null)
  // 松手时 state 可能还没刷新，位移另外存一份，判定阈值用
  const offsetRef = useRef(0)

  const reset = () => {
    startRef.current = null
    offsetRef.current = 0
    setOffset(0)
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    // 抬头上的按钮、输入框保持原有交互
    if ((event.target as Element).closest('button, a, input, textarea')) {
      return
    }
    startRef.current = {
      pointerId: event.pointerId,
      origin: direction === 'left' ? event.clientX : event.clientY,
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // 指针已经抬起时捕获会失败，拖动逻辑不依赖它
    }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const start = startRef.current
    if (!start || start.pointerId !== event.pointerId) {
      return
    }
    const delta = (direction === 'left' ? event.clientX : event.clientY) - start.origin
    const next = direction === 'left' ? Math.min(0, delta) : Math.max(0, delta)
    offsetRef.current = next
    setOffset(next)
  }

  const finish = (event: ReactPointerEvent<HTMLElement>) => {
    const start = startRef.current
    if (!start || start.pointerId !== event.pointerId) {
      return
    }
    const passed = direction === 'left' ? offsetRef.current < -threshold : offsetRef.current > threshold
    reset()
    if (passed) {
      onDismiss()
    }
  }

  const style: CSSProperties | undefined =
    offset === 0
      ? undefined
      : {
          transform: direction === 'left' ? `translateX(${offset}px)` : `translateY(${offset}px)`,
          transition: 'none',
        }

  return {
    style,
    dragging: offset !== 0,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
    },
  }
}
