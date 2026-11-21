import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

/** 可能铺满屏幕的浮层：弹窗、菜单、下拉框、移动端抽屉都用这些标记。 */
const overlaySelector =
  '[role="dialog"], [role="menu"], [role="listbox"], [aria-modal="true"], [data-overlay]'

/**
 * 安卓返回键：先关掉最上层浮层，其次是历史回退，最后才退出应用。
 * 浮层都靠 Esc 关闭（见 useDismiss），这里直接派发一次键盘事件复用同一套逻辑。
 */
export const setupAndroidBackButton = () => {
  if (!Capacitor.isNativePlatform()) {
    return
  }
  void App.addListener('backButton', ({ canGoBack }) => {
    if (document.querySelector(overlaySelector)) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      return
    }
    if (canGoBack) {
      window.history.back()
      return
    }
    void App.exitApp()
  })
}
