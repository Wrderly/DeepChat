import clsx from 'clsx'
import { useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { PROTOCOL_DEFAULTS } from '../../services/providers/constants.js'
import {
  createProvider,
  isBuiltinProvider,
  removeProvider,
  setDefaultProvider,
  useProviders,
} from '../../services/providers/store.js'
import type { ModelProvider } from '../../services/providers/types.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { ProviderEditor } from './ProviderEditor.js'
import styles from './Provider.module.css'

/** 设置页的「模型服务」：列出提供商，支持添加、编辑、设为默认与删除 */
export const ProviderSection = () => {
  const t = useTranslate()
  const items = useProviders((state) => state.items)
  const defaultProviderId = useProviders((state) => state.defaultProviderId)
  const [editing, setEditing] = useState<ModelProvider | null>(null)
  const [removing, setRemoving] = useState<ModelProvider | null>(null)

  const add = () =>
    setEditing(
      createProvider({
        name: '',
        protocol: 'openai',
        baseUrl: PROTOCOL_DEFAULTS.openai.baseUrl,
        apiPath: PROTOCOL_DEFAULTS.openai.apiPath,
        models: [],
      })
    )

  return (
    <div className={styles.section}>
      <div className={styles.head}>
        <div className={styles.title}>{t('providersTitle')}</div>
        <p className={styles.description}>{t('providersDescription')}</p>
      </div>
      <div className={styles.list}>
        {items.map((provider) => {
          const isDefault = provider.id === defaultProviderId
          const builtin = isBuiltinProvider(provider)
          return (
            <div key={provider.id} className={clsx(styles.card, isDefault && styles.cardDefault)}>
              <div className={styles.cardHead}>
                <span className={styles.cardName}>{provider.name}</span>
                <span className={styles.badges}>
                  <span className={styles.badge}>
                    {t(
                      provider.protocol === 'openai'
                        ? 'providerProtocolOpenAI'
                        : 'providerProtocolAnthropic'
                    )}
                  </span>
                  {builtin ? (
                    <span className={styles.badge}>{t('providerBuiltinBadge')}</span>
                  ) : null}
                  {isDefault ? (
                    <span className={clsx(styles.badge, styles.badgeDefault)}>
                      {t('providerDefaultBadge')}
                    </span>
                  ) : null}
                </span>
              </div>
              <div className={styles.cardMeta}>
                {provider.baseUrl}
                {provider.apiPath} · {t('providerModelCount', { count: provider.models.length })}
              </div>
              {provider.apiKey ? null : (
                <div className={styles.cardMeta}>{t('providerApiKeyRequired')}</div>
              )}
              <div className={styles.cardActions}>
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => setEditing(provider)}
                >
                  {t('providerEdit')}
                </button>
                {isDefault ? null : (
                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={() => setDefaultProvider(provider.id)}
                  >
                    {t('providerSetDefault')}
                  </button>
                )}
                {builtin ? null : (
                  <button
                    type="button"
                    className={clsx(styles.linkButton, styles.linkDanger)}
                    onClick={() => setRemoving(provider)}
                  >
                    {t('providerDelete')}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <Button variant="outlined" size="m" className={styles.addButton} onClick={add}>
        + {t('providerAdd')}
      </Button>
      {editing ? <ProviderEditor initial={editing} onClose={() => setEditing(null)} /> : null}
      {removing ? (
        <Modal title={t('providerDeleteTitle')} closable onClose={() => setRemoving(null)}>
          <p className={styles.confirmText}>{t('providerDeleteDescription')}</p>
          <div className={styles.confirmActions}>
            <Button variant="outlined" size="m" onClick={() => setRemoving(null)}>
              {t('cancel')}
            </Button>
            <Button
              variant="danger"
              size="m"
              onClick={() => {
                removeProvider(removing.id)
                setRemoving(null)
              }}
            >
              {t('delete')}
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
