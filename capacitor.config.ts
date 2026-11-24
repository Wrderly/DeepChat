import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.wrderly.deepchat',
  appName: 'DeepChat',
  webDir: 'dist',
  android: {
    // 页面由 WebView 从 https://localhost 加载，属于安全上下文，录音等能力可以直接使用。
    // WebView 背景保持透明，页面画出第一帧之前露出的就是主题窗口底色（见 res/values-night），
    // 写死白色会让深色模式先闪一屏白。
    backgroundColor: '#00000000',
  },
}

// Capacitor CLI 要求默认导出。
// oxlint-disable-next-line import/no-default-export
export default config
