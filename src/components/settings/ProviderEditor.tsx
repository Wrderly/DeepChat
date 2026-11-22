import clsx from 'clsx'
import { useState } from 'react'
import { useTranslate, type TranslationKey, type TranslationMessage } from '../../i18n/index.js'
import { ApiError } from '../../services/api/client.js'
import { fetchProviderModels } from '../../services/providers/api.js'
import { PROTOCOL_DEFAULTS } from '../../services/providers/constants.js'
import {
  addProvider,
  isBuiltinProvider,
  updateProvider,
  useProviders,
} from '../../services/providers/store.js'
import type {
  ApiProtocol,
  ModelCapability,
  ModelProvider,
  ProviderModel,
} from '../../services/providers/types.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { Select } from '../base/Select.js'
import { showToast } from '../base/toastState.js'
import styles from './Provider.module.css'

const CAPABILITIES: { value: ModelCapability; label: TranslationKey }[] = [
  { value: 'thinking', label: 'capabilityThinking' },
  { value: 'vision', label: 'capabilityVision' },
  { value: 'document', label: 'capabilityDocument' },
  { value: 'prefill', label: 'capabilityPrefill' },
]

const jsonText = (value: Record<string, unknown> | undefined): string =>
  value && Object.keys(value).length > 0 ? JSON.stringify(value, null, 2) : ''

/** 空字符串视为未填写；内容不是 JSON 对象时返回 undefined */
const parseJsonObject = (text: string): Record<string, unknown> | undefined => {
  if (!text.trim()) {
    return {}
  }
  try {
    const parsed: unknown = JSON.parse(text)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

const errorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    return typeof error.message === 'string' && error.message
      ? error.message
      : `HTTP ${error.status ?? ''}`
  }
  return error instanceof Error ? error.message : ''
}

type Draft = {
  name: string
  protocol: ApiProtocol
  baseUrl: string
  apiPath: string
  apiKey: string
  models: ProviderModel[]
  defaultModelId: string | null
  extraHeaders: string
  extraBody: string
}

/**
 * 单个提供商的编辑表单：协议、地址、密钥与模型列表。
 * 内置提供商的协议与地址固定，避免破坏 Files API、搜索等扩展。
 */
export const ProviderEditor = ({
  initial,
  onClose,
}: {
  initial: ModelProvider
  onClose: () => void
}) => {
  const t = useTranslate()
  const builtin = isBuiltinProvider(initial)
  const [draft, setDraft] = useState<Draft>(() => ({
    name: initial.name,
    protocol: initial.protocol,
    baseUrl: initial.baseUrl,
    apiPath: initial.apiPath,
    apiKey: initial.apiKey,
    models: initial.models.map((model) => ({
      ...model,
      capabilities: [...model.capabilities],
    })),
    defaultModelId: initial.defaultModelId,
    extraHeaders: jsonText(initial.extraHeaders),
    extraBody: jsonText(initial.extraBody),
  }))
  const [error, setError] = useState<TranslationMessage | null>(null)
  const [actionError, setActionError] = useState<TranslationMessage | null>(null)
  const [fetching, setFetching] = useState(false)
  const [advanced, setAdvanced] = useState(Boolean(draft.extraHeaders || draft.extraBody))

  const update = (patch: Partial<Draft>) => setDraft((value) => ({ ...value, ...patch }))

  const updateModel = (index: number, patch: Partial<ProviderModel>) =>
    setDraft((value) => ({
      ...value,
      models: value.models.map((model, i) => (i === index ? { ...model, ...patch } : model)),
    }))

  const removeModel = (index: number) =>
    setDraft((value) => {
      const models = value.models.filter((_, i) => i !== index)
      const defaultModelId =
        value.defaultModelId && models.some((model) => model.id === value.defaultModelId)
          ? value.defaultModelId
          : (models[0]?.id ?? null)
      return { ...value, models, defaultModelId }
    })

  const addModel = () =>
    setDraft((value) => ({
      ...value,
      models: [...value.models, { id: '', name: '', capabilities: ['thinking'] }],
    }))

  const changeProtocol = (protocol: ApiProtocol) => {
    const current = PROTOCOL_DEFAULTS[draft.protocol]
    const next = PROTOCOL_DEFAULTS[protocol]
    setDraft((value) => ({
      ...value,
      protocol,
      baseUrl: value.baseUrl === current.baseUrl ? next.baseUrl : value.baseUrl,
      apiPath: value.apiPath === current.apiPath ? next.apiPath : value.apiPath,
    }))
  }

  /** 只做本地字段校验，返回整理后的值 */
  const validate = (): ModelProvider | TranslationMessage => {
    const name = draft.name.trim()
    if (!name) {
      return { key: 'providerNameRequired' }
    }
    const rawUrl = draft.baseUrl.trim().replace(/\/+$/, '')
    let url: URL
    try {
      url = new URL(rawUrl)
    } catch {
      return { key: 'providerUrlInvalid' }
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { key: 'providerUrlInvalid' }
    }
    const apiPath = draft.apiPath.trim()
    if (!apiPath.startsWith('/')) {
      return { key: 'providerPathInvalid' }
    }
    const models = draft.models
      .map((model) => ({
        id: model.id.trim(),
        name: model.name.trim() || model.id.trim(),
        capabilities: model.capabilities,
      }))
      .filter((model) => model.id)
    if (models.length === 0) {
      return { key: 'providerModelRequired' }
    }
    if (new Set(models.map((model) => model.id)).size !== models.length) {
      return { key: 'providerModelDuplicate' }
    }
    const extraHeaders = parseJsonObject(draft.extraHeaders)
    const extraBody = parseJsonObject(draft.extraBody)
    if (extraHeaders === undefined || extraBody === undefined) {
      return { key: 'providerExtraInvalid' }
    }
    const headers = Object.fromEntries(
      Object.entries(extraHeaders).filter(([, value]) => typeof value === 'string')
    ) as Record<string, string>
    return {
      ...initial,
      name,
      protocol: draft.protocol,
      baseUrl: rawUrl,
      apiPath,
      apiKey: draft.apiKey.trim(),
      models,
      defaultModelId:
        draft.defaultModelId && models.some((model) => model.id === draft.defaultModelId)
          ? draft.defaultModelId
          : models[0].id,
      extraHeaders: headers,
      extraBody,
    }
  }

  const save = () => {
    const result = validate()
    if ('key' in result) {
      setError(result)
      return
    }
    const exists = useProviders.getState().items.some((provider) => provider.id === result.id)
    if (exists) {
      updateProvider(result.id, () => result)
    } else {
      addProvider(result)
    }
    onClose()
  }

  const fetchModels = async () => {
    setActionError(null)
    const candidate = validate()
    if ('key' in candidate) {
      setActionError(candidate)
      return
    }
    setFetching(true)
    try {
      const ids = await fetchProviderModels(candidate)
      if (ids.length === 0) {
        setActionError({ key: 'providerFetchEmpty' })
        return
      }
      setDraft((value) => {
        const models = [...value.models]
        for (const id of ids) {
          if (!models.some((model) => model.id === id)) {
            models.push({ id, name: id, capabilities: [] })
          }
        }
        return {
          ...value,
          models,
          defaultModelId: value.defaultModelId ?? ids[0],
        }
      })
      showToast({ key: 'providerModelsFetched', params: { count: ids.length } })
    } catch (caught) {
      setActionError({
        key: 'providerVerifyFailed',
        params: { message: errorMessage(caught) || String(caught) },
      })
    } finally {
      setFetching(false)
    }
  }

  const protocolOptions: { value: ApiProtocol; label: string }[] = [
    { value: 'anthropic', label: t('providerProtocolAnthropic') },
    { value: 'openai', label: t('providerProtocolOpenAI') },
  ]
  const modelOptions = draft.models
    .map((model) => model.id.trim())
    .filter((id, index, ids) => id && ids.indexOf(id) === index)
    .map((id) => ({
      value: id,
      label: draft.models.find((model) => model.id.trim() === id)?.name || id,
    }))

  return (
    <Modal
      className={styles.editorDialog}
      mainClassName={styles.editorMain}
      title={builtin ? t('providerEdit') : initial.name ? t('providerEdit') : t('providerAdd')}
      sheet
      dragToClose
      closable
      onClose={onClose}
      footer={
        <div className={styles.footer}>
          <Button variant="outlined" size="m" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button size="m" onClick={save} disabled={fetching}>
            {t('save')}
          </Button>
        </div>
      }
    >
      <div className={styles.editor}>
        {builtin ? <p className={styles.hint}>{t('providerBuiltinHint')}</p> : null}
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t('providerName')}</span>
          <input
            className={styles.input}
            value={draft.name}
            placeholder={t('providerNamePlaceholder')}
            onChange={(event) => update({ name: event.target.value })}
          />
        </label>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t('providerProtocol')}</span>
          <Select
            value={draft.protocol}
            options={protocolOptions}
            disabled={builtin}
            onChange={changeProtocol}
          />
          {builtin ? null : <span className={styles.hint}>{t('providerProtocolHint')}</span>}
        </div>
        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t('providerBaseUrl')}</span>
            <input
              className={styles.input}
              value={draft.baseUrl}
              placeholder={t('providerBaseUrlPlaceholder')}
              disabled={builtin}
              onChange={(event) => update({ baseUrl: event.target.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t('providerApiPath')}</span>
            <input
              className={styles.input}
              value={draft.apiPath}
              placeholder={t('providerApiPathPlaceholder')}
              disabled={builtin}
              onChange={(event) => update({ apiPath: event.target.value })}
            />
          </label>
        </div>
        {!builtin && draft.baseUrl.trim().startsWith('http://') ? (
          <span className={styles.hint}>{t('providerHttpHint')}</span>
        ) : null}
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t('providerApiKey')}</span>
          <input
            className={styles.input}
            type="password"
            value={draft.apiKey}
            placeholder={t('providerApiKeyPlaceholder')}
            autoComplete="off"
            onChange={(event) => update({ apiKey: event.target.value })}
          />
        </label>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t('providerModels')}</span>
          <div className={styles.models}>
            {draft.models.map((model, index) => (
              <div className={styles.modelRow} key={index}>
                <div className={styles.modelRowHead}>
                  <input
                    className={styles.input}
                    value={model.id}
                    placeholder={t('providerModelId')}
                    onChange={(event) => updateModel(index, { id: event.target.value })}
                  />
                  <button
                    type="button"
                    className={clsx(styles.linkButton, styles.linkDanger)}
                    onClick={() => removeModel(index)}
                  >
                    {t('delete')}
                  </button>
                </div>
                <input
                  className={styles.input}
                  value={model.name}
                  placeholder={t('providerModelName')}
                  onChange={(event) => updateModel(index, { name: event.target.value })}
                />
                <div className={styles.capabilities}>
                  {CAPABILITIES.map((capability) => (
                    <label key={capability.value} className={styles.capability}>
                      <input
                        type="checkbox"
                        checked={model.capabilities.includes(capability.value)}
                        onChange={(event) =>
                          updateModel(index, {
                            capabilities: event.target.checked
                              ? [...model.capabilities, capability.value]
                              : model.capabilities.filter((item) => item !== capability.value),
                          })
                        }
                      />
                      {t(capability.label)}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button type="button" className={styles.linkButton} onClick={addModel}>
            + {t('providerAddModel')}
          </button>
          {modelOptions.length > 1 ? (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{t('providerDefaultModel')}</span>
              <Select
                value={draft.defaultModelId ?? modelOptions[0].value}
                options={modelOptions}
                onChange={(value) => update({ defaultModelId: value })}
              />
            </div>
          ) : null}
        </div>
        <div className={styles.row}>
          <Button
            variant="outlined"
            size="m"
            onClick={() => void fetchModels()}
            disabled={fetching}
          >
            {fetching ? t('providerFetching') : t('providerFetchModels')}
          </Button>
        </div>
        {builtin ? null : (
          <>
            <button
              type="button"
              className={styles.advancedToggle}
              onClick={() => setAdvanced((value) => !value)}
            >
              {advanced ? '− ' : '+ '}
              {t('providerAdvanced')}
            </button>
            {advanced ? (
              <>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>{t('providerExtraHeaders')}</span>
                  <textarea
                    className={styles.textarea}
                    value={draft.extraHeaders}
                    placeholder='{"X-Example": "value"}'
                    onChange={(event) => update({ extraHeaders: event.target.value })}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>{t('providerExtraBody')}</span>
                  <textarea
                    className={styles.textarea}
                    value={draft.extraBody}
                    placeholder='{"provider": {"order": ["my-provider"]}}'
                    onChange={(event) => update({ extraBody: event.target.value })}
                  />
                </label>
              </>
            ) : null}
          </>
        )}
        {error ? <span className={styles.error}>{t(error.key, error.params)}</span> : null}
        {actionError ? (
          <span className={styles.error}>{t(actionError.key, actionError.params)}</span>
        ) : null}
        {!builtin ? <span className={styles.hint}>{t('providerCorsHint')}</span> : null}
      </div>
    </Modal>
  )
}
