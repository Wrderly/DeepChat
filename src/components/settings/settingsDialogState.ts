import { create } from 'zustand'
import { defaultModelRef, resolveModel } from '../../services/providers/select.js'

/** 设置弹窗的分组：通用设置 / 模型服务 / 模型参数 / 数据管理 */
export type SettingsSection = 'general' | 'providers' | 'model' | 'data'

/** 设置弹窗：侧边栏底部、缺少模型或密钥时的操作与 401 提示都可以打开；section 为打开时选中的分组 */
export const useSettingsDialog = create(() => ({
  open: false,
  section: 'general' as SettingsSection,
}))

export const openSettings = (section: SettingsSection) =>
  useSettingsDialog.setState({ open: true, section })

export const closeSettings = () => useSettingsDialog.setState({ open: false })

/** 默认模型或其提供商不可用（没有密钥）时打开「模型服务」，返回是否可以开始对话 */
export const ensureChatReady = () => {
  const resolved = resolveModel(defaultModelRef())
  if (resolved?.provider.apiKey) {
    return true
  }
  openSettings('providers')
  return false
}
