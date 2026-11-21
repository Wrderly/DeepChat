import { useEffect, useLayoutEffect, useState } from 'react'

/** 与各组件 CSS 里的过渡时长保持一致 */
export const PRESENCE_DURATION = 180

/**
 * 让元素在关闭后多留一会儿，用来播放退场过渡。
 *
 * `mounted` 在 `open` 变为 true 的同一帧就置为 true，浮层随点击一起挂载；
 * `visible` 在同一帧内稍后翻转，翻转前先强制浏览器算一次「收起」样式，
 * 这样 CSS 过渡立刻有起点，打开动画不用等下一帧。
 */
export const usePresence = (open: boolean, duration = PRESENCE_DURATION) => {
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)

  // 渲染阶段直接挂载，省掉一次由 effect 触发的额外提交
  if (open && !mounted) {
    setMounted(true)
  }
  // 关闭也从当前这一帧开始，退场过渡不会晚一帧
  if (!open && visible) {
    setVisible(false)
  }

  useLayoutEffect(() => {
    if (!open || visible) {
      return
    }
    // 先让浏览器算出提交后的「收起」样式，再切到「展开」，过渡才能立即开始
    void document.body.offsetHeight
    setVisible(true)
  }, [open, visible])

  useEffect(() => {
    if (open || !mounted) {
      return
    }
    const timer = setTimeout(() => setMounted(false), duration)
    return () => clearTimeout(timer)
  }, [open, mounted, duration])

  return { mounted, visible, closing: mounted && !open }
}
