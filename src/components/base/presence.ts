import { useEffect, useState } from 'react'

/** 与各组件 CSS 里的过渡时长保持一致 */
export const PRESENCE_DURATION = 180

/**
 * 让元素在关闭后多留一会儿，用来播放退场过渡。
 *
 * `mounted` 为 false 时元素可以不渲染；`visible` 表示是否处于“展开”状态，
 * 元素首次挂载时它还是 false，下一帧才变成 true，这样 CSS 过渡才有起点。
 */
export const usePresence = (open: boolean, duration = PRESENCE_DURATION) => {
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(open)

  useEffect(() => {
    if (open) {
      setMounted(true)
      const frame = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(frame)
    }
    setVisible(false)
    if (!mounted) {
      return
    }
    const timer = setTimeout(() => setMounted(false), duration)
    return () => clearTimeout(timer)
  }, [open, mounted, duration])

  return { mounted, visible, closing: mounted && !open }
}
