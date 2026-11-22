import clsx from 'clsx'
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  IconCameraOutline20,
  IconCloseOutline16,
  IconFileOutline20,
  IconGlobeLanguageOutline14,
  IconImageOutline20,
  IconPaperclipOutline16,
  IconPlusOutline16,
  IconSendOutline16,
  IconSlidersOutline14,
  IconStopFill16,
  IconThinkOutline14,
} from '../base/icons.js'
import { setSearch, setThinking, useSettings } from '../../services/settings.js'
import { useIsMobile } from '../../app/viewport.js'
import {
  sendMessage,
  setSessionApiOptions,
  setSessionSystemPrompt,
  stopReply,
  useChatStore,
} from '../../services/chat/store.js'
import type { ApiOptions } from '../../services/api/options.js'
import {
  addDraftFiles,
  EMPTY_DRAFT,
  getDraft,
  prepareDraftMessage,
  removeDraftAttachment,
  retryDraftAttachment,
  setDraftText,
  useDrafts,
} from '../../services/chat/drafts.js'
import { stopReadAloud } from '../../services/speech/readAloud.js'
import { IconButton } from '../base/IconButton.js'
import { Menu } from '../base/Menu.js'
import { Tooltip } from '../base/Tooltip.js'
import { useDismiss } from '../base/anchored.js'
import { ensureChatReady, openSettings } from '../settings/settingsDialogState.js'
import {
  deepSeekApiKey,
  defaultModelRef,
  isDeepSeekProvider,
  modelSupports,
  resolveModel,
  sessionModelRef,
} from '../../services/providers/select.js'
import { useProviders } from '../../services/providers/store.js'
import { ApiOptionsPanel } from '../apiOptions/ApiOptionsPanel.js'
import { DragMask, useFileDrop } from './DragMask.js'
import { showToast } from '../base/toastState.js'
import { ACCEPT, MAX_COUNT, useUploads } from '../../services/attachments.js'
import { pickAlbumImages, takePhoto } from '../../services/platform/albumPicker.js'
import { DraftAttachments } from './DraftAttachments.js'
import { ModelPicker } from './ModelPicker.js'
import { useComposerModel } from './composerModel.js'
import { useVoiceInput } from './useVoiceInput.js'
import { VoiceButton } from './VoiceButton.js'
import { Spectrum } from './Spectrum.js'
import { useTranslate } from '../../i18n/index.js'
import styles from './ChatInput.module.css'

/** 输入框：自适应高度的文本框 + 文件 + 深度思考与智能搜索开关 + 语音输入 + 发送 / 停止 */
export const ChatInput = memo(function ChatInput({ sessionId }: { sessionId: string | null }) {
  // 切换目标时释放录音、转写和 DOM 状态；文字与附件由草稿服务保留。
  return <Input key={sessionId === null ? 'new' : `session:${sessionId}`} sessionId={sessionId} />
})

const Input = ({ sessionId }: { sessionId: string | null }) => {
  const t = useTranslate()
  const draft = useDrafts((state) => state.drafts.get(sessionId) ?? EMPTY_DRAFT)
  const { text, attachments } = draft
  const setText = (value: string) => setDraftText(sessionId, value)
  const draftReady = useUploads((state) => prepareDraftMessage(draft, state.tasks) !== null)
  const streaming = useChatStore(
    (state) => sessionId !== null && Object.hasOwn(state.streaming, sessionId)
  )
  const thinking = useSettings((state) => state.thinking)
  const importingHistory = useChatStore((state) => state.importingHistory)
  const isMobile = useIsMobile()
  const search = useSettings((state) => state.search)
  // 提供商或模型变化时重新计算当前能力
  useProviders((state) => state.items)
  const session = useChatStore((state) =>
    sessionId === null ? undefined : state.sessionCache[sessionId]
  )
  const composerModel = useComposerModel((state) => state.model)
  const preferredRef =
    sessionId === null ? (composerModel ?? defaultModelRef()) : sessionModelRef(session ?? null)
  // 提供商被删除后本地选择可能失效，回退到当前默认模型
  const activeRef = resolveModel(preferredRef) ? preferredRef : defaultModelRef()
  const active = resolveModel(activeRef)
  const preset = isDeepSeekProvider(active?.provider)
  const supportsThinking = modelSupports(active?.model, 'thinking')
  const sessionOptions = useChatStore((state): ApiOptions | undefined => {
    const session = sessionId === null ? undefined : state.sessionCache[sessionId]
    return session ? session.options : undefined
  })
  const sessionSystemPrompt = useChatStore((state): string | undefined => {
    const session = sessionId === null ? undefined : state.sessionCache[sessionId]
    return session ? session.systemPrompt : undefined
  })
  // 新会话在发出第一条消息前还没有会话对象，设置先留在本地，发送时交给新会话
  const [draftOptions, setDraftOptions] = useState<ApiOptions | undefined>(undefined)
  const [draftSystemPrompt, setDraftSystemPrompt] = useState<string | undefined>(undefined)
  const options = sessionId === null ? draftOptions : sessionOptions
  const systemPrompt = sessionId === null ? draftSystemPrompt : sessionSystemPrompt
  const setOptions = (next: ApiOptions | undefined) => {
    if (sessionId === null) {
      setDraftOptions(next)
      return
    }
    setSessionApiOptions(sessionId, next)
  }
  const setSystemPrompt = (next: string) => {
    if (sessionId === null) {
      setDraftSystemPrompt(next.trim() ? next : undefined)
      return
    }
    setSessionSystemPrompt(sessionId, next)
  }
  const sessionCustomized = options !== undefined || Boolean(systemPrompt)
  const optionsNote = sessionCustomized
    ? sessionId === null
      ? t('apiOptionsDraftNote')
      : t('apiOptionsCustomized')
    : sessionId === null
      ? t('apiOptionsDraftFollowDefaults')
      : t('apiOptionsFollowDefaults')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const togglesRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const toggles = togglesRef.current
    if (!toggles) {
      return
    }

    const updateLabels = () => {
      toggles.classList.remove(styles.collapsedToggles)
      toggles.classList.toggle(styles.collapsedToggles, toggles.scrollWidth > toggles.clientWidth)
    }

    updateLabels()
    const observer = new ResizeObserver(updateLabels)
    observer.observe(toggles)
    return () => observer.disconnect()
  }, [t])

  const acceptFiles = (files: File[]) => {
    if (files.length === 0 || useChatStore.getState().importingHistory) {
      return
    }
    if (!ensureChatReady() || !active) {
      return
    }
    if (!active.provider.apiKey) {
      openSettings('providers')
      return
    }
    const error = addDraftFiles(sessionId, files, {
      apiKey: active.provider.apiKey,
      filesApi: preset,
    })
    if (error) {
      showToast(error)
    }
  }

  const [trayOpen, setTrayOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  useDismiss(trayOpen, [wrapperRef], () => setTrayOpen(false))

  /**
   * 相册与拍照：先做和文件入口相同的预检，避免选完才被要求配置 API Key。
   * 唤起系统界面时输入框会失焦，回来时不要再把键盘弹起来挡住缩略图。
   */
  const pickFromSystem = async (pick: () => Promise<File[]>) => {
    if (useChatStore.getState().importingHistory) {
      return
    }
    if (!ensureChatReady() || !active) {
      return
    }
    if (!active.provider.apiKey) {
      openSettings('providers')
      return
    }
    // 附件已满时不开选择器：相册和拍照至少会再加一张，直接给出与文件入口一致的提示
    if (MAX_COUNT - attachments.length <= 0) {
      showToast({ key: 'uploadMaxFiles', params: { count: MAX_COUNT } })
      return
    }
    setTrayOpen(false)
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    try {
      acceptFiles(await pick())
    } catch {
      showToast({ key: 'uploadPickFailed' })
    }
  }
  // 剩余额度作为单次选择上限，超出时仍由 validateFiles 整批提示
  const openAlbum = () => {
    void pickFromSystem(() => pickAlbumImages(MAX_COUNT - attachments.length))
  }
  const openCamera = () => {
    void pickFromSystem(takePhoto)
  }
  const openFilePicker = () => {
    if (ensureChatReady()) {
      fileInputRef.current?.click()
    }
  }
  const retryFile = useCallback(
    (id: string) => {
      if (useChatStore.getState().importingHistory) {
        return
      }
      if (!active?.provider.apiKey) {
        openSettings('providers')
        return
      }
      retryDraftAttachment(sessionId, id, active.provider.apiKey)
    },
    [sessionId, active?.provider.apiKey]
  )
  const removeFile = useCallback(
    (id: string) => {
      if (!useChatStore.getState().importingHistory) {
        removeDraftAttachment(sessionId, id)
      }
    },
    [sessionId]
  )
  const dragging = useFileDrop(acceptFiles)

  /** 转写结果插入到光标处，并把光标移到插入内容之后 */
  const voice = useVoiceInput((transcript) => {
    const textarea = textareaRef.current
    const current = getDraft(sessionId).text
    const start = textarea?.selectionStart ?? current.length
    const end = textarea?.selectionEnd ?? current.length
    setText(current.slice(0, start) + transcript + current.slice(end))
    requestAnimationFrame(() => {
      textarea?.focus({ preventScroll: true })
      textarea?.setSelectionRange(start + transcript.length, start + transcript.length)
    })
  })

  // 欢迎页导入后会话 ID 不变，不能依赖卸载取消语音；订阅开始事件也覆盖快速完成的导入。
  const cancelVoice = voice.cancel
  useEffect(
    () =>
      useChatStore.subscribe((state, previous) => {
        if (state.importingHistory && !previous.importingHistory) {
          cancelVoice()
        }
      }),
    [cancelVoice]
  )

  // 移动端录音时用频谱替代输入框内容
  const recording = voice.status === 'recording'

  // 排队、上传中或上传失败的附件都留在输入框，全部上传成功后才能发送
  const canSend = !importingHistory && !streaming && voice.status === 'idle' && draftReady

  const send = () => {
    if (
      useChatStore.getState().importingHistory ||
      voice.status !== 'idle' ||
      !prepareDraftMessage(getDraft(sessionId), useUploads.getState().tasks)
    ) {
      return
    }
    // 文本与上传完成态由提交动作读取最新快照，不使用上一次渲染的草稿。
    if (
      !ensureChatReady() ||
      !sendMessage(sessionId, options, systemPrompt, sessionId === null ? activeRef : undefined)
    ) {
      return
    }
    stopReadAloud()
    if (isMobile) {
      textareaRef.current?.blur()
    } else {
      textareaRef.current?.focus()
    }
  }

  return (
    <div
      ref={wrapperRef}
      className={clsx(styles.wrapper, sessionId === null ? styles.home : styles.session)}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          textareaRef.current?.focus({ preventScroll: true })
        }
      }}
    >
      <DraftAttachments items={attachments} onRetry={retryFile} onRemove={removeFile} />
      <div className={styles.textareaWrapper}>
        <textarea
          ref={textareaRef}
          className={clsx(styles.textarea, recording && isMobile && styles.textareaHidden)}
          placeholder={t('chatInputPlaceholderChat')}
          rows={2}
          // 移动端不自动聚焦，避免一打开就弹出键盘
          autoFocus={!isMobile}
          disabled={importingHistory}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onMouseDown={(event) => {
            // 首次点击时手动聚焦，避免 Safari 把整个页面滚到输入框位置。
            if (isMobile && event.button === 0 && document.activeElement !== event.currentTarget) {
              event.preventDefault()
              event.currentTarget.focus({ preventScroll: true })
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              send()
            }
          }}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files)
            if (files.length > 0) {
              event.preventDefault()
              acceptFiles(files)
            }
          }}
        />
        {recording && isMobile ? <Spectrum getAnalyser={voice.getAnalyser} /> : null}
        <div className={styles.mirror} aria-hidden>
          {`${text}\n`}
        </div>
      </div>
      <div className={styles.functionRow}>
        {/* 深度思考 / 智能搜索开关，tooltip 在按钮上方 */}
        <div ref={togglesRef} className={styles.toggles}>
          <Tooltip
            content={
              supportsThinking ? t('deactivatedThinkTooltip') : t('thinkingUnsupportedTooltip')
            }
          >
            <button
              type="button"
              className={clsx(styles.toggle, thinking && styles.selected)}
              aria-label={t('thinkingSwitch')}
              aria-pressed={thinking}
              aria-disabled={!supportsThinking}
              disabled={!supportsThinking}
              onClick={() => setThinking(!thinking)}
            >
              <IconThinkOutline14 />
              <span className={styles.toggleLabel}>{t('thinkingSwitch')}</span>
            </button>
          </Tooltip>
          {preset ? (
            <Tooltip content={t('deactivatedSearchTooltip')}>
              <button
                type="button"
                className={clsx(styles.toggle, search && styles.selected)}
                aria-label={t('search')}
                aria-pressed={search}
                onClick={() => setSearch(!search)}
              >
                <IconGlobeLanguageOutline14 />
                <span className={styles.toggleLabel}>{t('search')}</span>
              </button>
            </Tooltip>
          ) : null}
          <ApiOptionsPanel
            value={options}
            onChange={setOptions}
            systemPrompt={systemPrompt}
            onSystemPromptChange={setSystemPrompt}
            note={optionsNote}
          >
            {({ open, toggle, customized }) => {
              const button = (
                <button
                  type="button"
                  className={clsx(styles.toggle, (open || customized) && styles.selected)}
                  aria-label={t('apiOptionsTitle')}
                  aria-expanded={open}
                  onClick={toggle}
                >
                  <IconSlidersOutline14 />
                  <span className={styles.toggleLabel}>{t('apiOptionsTitle')}</span>
                </button>
              )
              // 浮层打开时不再显示 tooltip，避免与浮层内容重叠
              return open ? button : <Tooltip content={t('apiOptionsTooltip')}>{button}</Tooltip>
            }}
          </ApiOptionsPanel>
        </div>
        <div className={styles.right}>
          <ModelPicker sessionId={sessionId} />
          <VoiceButton
            status={voice.status}
            disabled={!voice.available}
            seconds={voice.seconds}
            onClick={() => {
              if (voice.status !== 'idle') {
                void voice.toggle()
                return
              }
              if (useChatStore.getState().importingHistory) {
                return
              }
              if (!deepSeekApiKey()) {
                openSettings('providers')
                return
              }
              void voice.toggle()
            }}
          />
          {isMobile ? (
            // 移动端按官方形态：加号展开附件托盘，入口不再直连文件管理器
            <IconButton
              size="m"
              tone="primary"
              icon={trayOpen ? <IconCloseOutline16 /> : <IconPlusOutline16 />}
              tooltip={t('uploadAttachments')}
              aria-expanded={trayOpen}
              disabled={importingHistory}
              onClick={() => setTrayOpen((open) => !open)}
            />
          ) : (
            <Menu
              options={[
                {
                  key: 'album',
                  label: t('uploadFromAlbum'),
                  icon: <IconImageOutline20 />,
                  onSelect: openAlbum,
                },
                {
                  key: 'file',
                  label: t('uploadFile'),
                  icon: <IconPaperclipOutline16 />,
                  onSelect: openFilePicker,
                },
              ]}
            >
              {({ toggle }) => (
                <IconButton
                  size="m"
                  tone="primary"
                  icon={<IconPaperclipOutline16 />}
                  tooltip={t('uploadAttachments')}
                  disabled={importingHistory}
                  onClick={() => {
                    if (ensureChatReady()) {
                      toggle()
                    }
                  }}
                />
              )}
            </Menu>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            accept={ACCEPT}
            onChange={(event) => {
              acceptFiles(Array.from(event.target.files ?? []))
              event.target.value = ''
            }}
          />
          {streaming && sessionId ? (
            <button
              type="button"
              className={styles.sendButton}
              aria-label={t('chatInputStopButtonTooltip')}
              onClick={() => {
                stopReadAloud()
                stopReply(sessionId)
              }}
            >
              <IconStopFill16 />
            </button>
          ) : (
            <button
              type="button"
              className={clsx(styles.sendButton, !canSend && styles.disabled)}
              aria-label={t('send')}
              aria-disabled={!canSend}
              onClick={send}
            >
              <IconSendOutline16 />
            </button>
          )}
        </div>
      </div>
      {isMobile ? (
        // 托盘常驻挂载、靠 0fr→1fr 过渡收放高度，关闭时也能播完动画
        <div className={styles.trayClip} data-open={trayOpen ? 'true' : 'false'}>
          <div className={styles.trayClipInner}>
            <div className={styles.tray}>
              <button type="button" className={styles.trayItem} onClick={openCamera}>
                <IconCameraOutline20 />
                <span>{t('uploadFromCamera')}</span>
              </button>
              <button type="button" className={styles.trayItem} onClick={openAlbum}>
                <IconImageOutline20 />
                <span>{t('uploadFromAlbum')}</span>
              </button>
              <button
                type="button"
                className={styles.trayItem}
                onClick={() => {
                  setTrayOpen(false)
                  openFilePicker()
                }}
              >
                <IconFileOutline20 />
                <span>{t('uploadFile')}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {dragging ? <DragMask /> : null}
    </div>
  )
}
