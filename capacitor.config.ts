import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.wrderly.deepseekchat',
  appName: 'DeepChat',
  webDir: 'dist',
  android: {
    // 页面由 WebView 从 https://localhost 加载，属于安全上下文，录音等能力可以直接使用。
    backgroundColor: '#ffffff',
  },
}

// Capacitor CLI 要求默认导出。
// oxlint-disable-next-line import/no-default-export
export default config
