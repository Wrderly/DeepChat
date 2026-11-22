import { create } from 'zustand'
import type { ModelRef } from '../../services/providers/types.js'

/**
 * 新对话输入框里选择的模型。
 * 只对新对话生效；会话创建后模型快照保存在会话上，null 表示跟随全局默认。
 */
export const useComposerModel = create<{
  model: ModelRef | null
  setModel: (model: ModelRef | null) => void
}>(() => ({
  model: null,
  setModel: (model) => useComposerModel.setState({ model }),
}))
