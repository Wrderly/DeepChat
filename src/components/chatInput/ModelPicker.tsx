import clsx from 'clsx'
import { useTranslate } from '../../i18n/index.js'
import { setSessionModel, useChatStore } from '../../services/chat/store.js'
import {
  defaultModelRef,
  resolveModel,
  sessionModelRef,
  toModelRef,
} from '../../services/providers/select.js'
import { useProviders } from '../../services/providers/store.js'
import type { ModelRef } from '../../services/providers/types.js'
import {
  IconCheckOutline16,
  IconChevronDownOutline14,
  IconModelOutline16,
  IconSettingsOutline16,
} from '../base/icons.js'
import { Menu, type MenuOption } from '../base/Menu.js'
import { openSettings } from '../settings/settingsDialogState.js'
import { useComposerModel } from './composerModel.js'
import styles from './ChatInput.module.css'

/**
 * 输入框的模型选择器：按提供商列出可用模型，末项进入「模型服务」管理。
 * 新对话写入本地选择，已有会话更新会话上的模型快照。
 */
export const ModelPicker = ({ sessionId }: { sessionId: string | null }) => {
  const t = useTranslate()
  const providers = useProviders((state) => state.items)
  const composerModel = useComposerModel((state) => state.model)
  const setComposerModel = useComposerModel((state) => state.setModel)
  const session = useChatStore((state) =>
    sessionId === null ? undefined : state.sessionCache[sessionId]
  )

  const preferredRef: ModelRef | null =
    sessionId === null ? (composerModel ?? defaultModelRef()) : sessionModelRef(session ?? null)
  // 提供商被删除后本地选择可能失效，回退到当前默认模型
  const currentRef: ModelRef | null = resolveModel(preferredRef) ? preferredRef : defaultModelRef()
  const resolved = resolveModel(currentRef)
  const providerName = resolved?.provider.name ?? currentRef?.providerName
  const modelName = resolved?.model.name ?? currentRef?.modelName
  const label = modelName ? `${providerName} / ${modelName}` : t('modelPickerEmpty')

  const options: MenuOption[] = []
  for (const provider of providers) {
    for (const model of provider.models) {
      const ref = toModelRef(provider, model)
      const selected =
        currentRef?.providerId === ref.providerId && currentRef?.modelId === ref.modelId
      options.push({
        key: `${provider.id}:${model.id}`,
        label: `${provider.name} / ${model.name}`,
        icon: selected ? <IconCheckOutline16 /> : <span className={styles.checkPlaceholder} />,
        onSelect: () => {
          if (sessionId === null) {
            setComposerModel(ref)
          } else {
            setSessionModel(sessionId, ref)
          }
        },
      })
    }
  }
  options.push({
    key: 'manage',
    label: t('modelPickerManage'),
    icon: <IconSettingsOutline16 />,
    onSelect: () => openSettings('providers'),
  })

  return (
    <Menu options={options}>
      {({ open, toggle }) => (
        <button
          type="button"
          className={clsx(styles.toggle, styles.modelButton, open && styles.selected)}
          aria-label={resolved ? `${t('modelPickerLabel')} ${label}` : t('modelPickerLabel')}
          aria-expanded={open}
          title={resolved ? label : undefined}
          onClick={toggle}
        >
          <span className={styles.modelIcon}>
            <IconModelOutline16 />
          </span>
          <span className={styles.modelLabel}>
            {modelName ? (
              <>
                <span className={styles.modelProvider}>{providerName} / </span>
                {modelName}
              </>
            ) : (
              t('modelPickerEmpty')
            )}
          </span>
          <IconChevronDownOutline14 />
        </button>
      )}
    </Menu>
  )
}
