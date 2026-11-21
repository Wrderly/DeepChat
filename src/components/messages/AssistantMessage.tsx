import { useTranslate } from '../../i18n/index.js'
import clsx from 'clsx'
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  IconBranchOutline16,
  IconEditOutline16,
  IconEllipsisOutline16,
  IconRefreshOutline16,
  IconThinkOutline16,
  IconWarningOutline16,
} from '../base/icons.js'
import { describeReply } from '../../services/chat/describe.js'
import { canContinueReply } from '../../services/chat/reply.js'
import {
  branchSession,
  continueReply,
  editReplyText,
  editReplyThinking,
  regenerateReply,
} from '../../services/chat/store.js'
import { stopReadAloud } from '../../services/speech/readAloud.js'
import type { AssistantMessage as AssistantMessageType } from '../../services/chat/types.js'
import { openSettings } from '../settings/settingsDialogState.js'
import { IconButton } from '../base/IconButton.js'
import { Menu, type MenuOption } from '../base/Menu.js'
import { Button } from '../base/Button.js'
import { Markdown } from '../markdown/Markdown.js'
import { SiteThumbnails } from '../search/SiteLogo.js'
import { toggleSearchPanel, useSearchPanel } from '../search/searchPanelState.js'
import { ReadAloudButton } from './ReadAloudButton.js'
import { CopyButton } from './CopyButton.js'
import { ReplyArea } from './ReplyArea.js'
import { useReplyView } from './useReplyView.js'
import {
  BranchSwitcher,
  type MessageVersions,
  type SelectMessageVersion,
} from './BranchSwitcher.js'
import styles from './AssistantMessage.module.css'

const TOP_UP_URL = 'https://platform.deepseek.com/top_up'

export const AssistantMessage = memo(function AssistantMessage({
  sessionId,
  message,
  isLast,
  streaming,
  busy,
  versions,
  onSelectVersion,
}: {
  sessionId: string
  message: AssistantMessageType
  isLast: boolean
  streaming: boolean
  busy: boolean
  versions: MessageVersions
  onSelectVersion: SelectMessageVersion
}) {
  const t = useTranslate()
  const view = useReplyView(message, streaming)
  const panelEntry = useSearchPanel((state) => state.entry)
  const notice = streaming ? null : describeReply(message)
  // 安全拒绝：已下发的思考与正文按协议丢弃，只显示模板答复。
  const refused = message.stopReason === 'refusal'
  const answer = refused ? null : view.answer
  const responseText = [answer?.text, notice?.presentation === 'response' ? notice.text : null]
    .filter(Boolean)
    .join('\n\n')
  const copyText = responseText || notice?.text
  const waiting = streaming && view.steps.length === 0 && !view.answer && !message.thinking
  const summaryEntry = `${message.id}-summary`
  const thinkingText = message.blocks
    .filter((block) => block.type === 'thinking')
    .map((block) => block.thinking)
    .join('')
  const [editing, setEditing] = useState<{ kind: 'thinking' | 'text'; draft: string } | null>(null)
  const [saved, setSaved] = useState<'thinking' | 'text' | null>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const node = editorRef.current
    if (editing && node) {
      node.style.height = 'auto'
      node.style.height = `${Math.min(node.scrollHeight, 320)}px`
    }
  }, [editing, editing?.draft])
  useEffect(() => {
    if (!saved) {
      return
    }
    const timer = setTimeout(() => setSaved(null), 700)
    return () => clearTimeout(timer)
  }, [saved])
  const saveEdit = () => {
    if (!editing) {
      return
    }
    if (editing.kind === 'thinking') {
      editReplyThinking(sessionId, message.id, editing.draft)
    } else {
      editReplyText(sessionId, message.id, editing.draft)
    }
    setSaved(editing.kind)
    setEditing(null)
  }
  const menuOptions: MenuOption[] = [
    ...(thinkingText.trim()
      ? [
          {
            key: 'thinking',
            label: t('editThinking'),
            icon: <IconEditOutline16 />,
            onSelect: () => setEditing({ kind: 'thinking', draft: thinkingText }),
          },
        ]
      : []),
    ...(answer
      ? [
          {
            key: 'text',
            label: t('editAnswer'),
            icon: <IconEditOutline16 />,
            onSelect: () => setEditing({ kind: 'text', draft: answer.text }),
          },
        ]
      : []),
    {
      key: 'branch',
      label: t('branchToNewChat'),
      icon: <IconBranchOutline16 />,
      onSelect: () => branchSession(sessionId, message.id),
    },
  ]
  const editor = editing ? (
    <div
      className={clsx(
        styles.editor,
        editing.kind === 'thinking' ? styles.thinkingEditor : styles.answerEditor
      )}
    >
      <div className={styles.editorLabel}>
        {editing.kind === 'thinking' ? <IconThinkOutline16 /> : <IconEditOutline16 />}
        <span>{t(editing.kind === 'thinking' ? 'editThinking' : 'editAnswer')}</span>
      </div>
      <textarea
        ref={editorRef}
        className={styles.editorTextarea}
        aria-label={t(editing.kind === 'thinking' ? 'editThinking' : 'editAnswer')}
        autoFocus
        value={editing.draft}
        onChange={(event) => setEditing({ ...editing, draft: event.target.value })}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) {
            return
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            setEditing(null)
          } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            saveEdit()
          }
        }}
      />
      <div className={styles.editorActions}>
        <Button size="s" variant="outlined" onClick={() => setEditing(null)}>
          {t('cancel')}
        </Button>
        <Button size="s" disabled={!editing.draft.trim()} onClick={saveEdit}>
          {t('save')}
        </Button>
      </div>
    </div>
  ) : null
  return (
    <div className={styles.message}>
      {refused ? null : (
        <div className={clsx(saved === 'thinking' && styles.savedFlash)}>
          <ReplyArea
            message={message}
            view={view}
            streaming={streaming}
            hasResponse={!!responseText}
            editor={editing?.kind === 'thinking' ? editor : undefined}
          />
        </div>
      )}
      {editing?.kind === 'text' ? (
        editor
      ) : answer ? (
        <div className={clsx(styles.answer, saved === 'text' && styles.savedFlash)}>
          <Markdown
            className="ds-assistant-message-main-content"
            content={answer.markdown}
            loading={streaming}
            cacheKey={message.id}
            disableLink={false}
            sources={view.sources}
          />
        </div>
      ) : null}
      {waiting ? (
        <div className={styles.waiting}>
          {[0, 1, 2].map((index) => (
            <span key={index} className={styles.waitingDot} />
          ))}
        </div>
      ) : null}
      {notice?.presentation === 'response' ? (
        <Markdown
          className="ds-assistant-message-main-content"
          content={notice.text}
          loading={false}
          cacheKey={`${message.id}-template`}
          disableLink={false}
        />
      ) : notice ? (
        <div className={styles.notice}>
          <IconWarningOutline16 />
          <span>
            {notice.text}
            {notice.action === 'apiKey' ? (
              <>
                {' '}
                <button
                  type="button"
                  className={styles.noticeAction}
                  onClick={() => openSettings('data')}
                >
                  {t('changeApiKey')}
                </button>
              </>
            ) : null}
            {notice.action === 'topUp' ? (
              <>
                {' '}
                <a
                  className={styles.noticeAction}
                  href={TOP_UP_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('topUp')}
                </a>
              </>
            ) : null}
          </span>
        </div>
      ) : null}
      {!streaming && !refused && view.searchResults.length > 0 ? (
        <div
          className={clsx(styles.summary, panelEntry === summaryEntry && styles.summaryActive)}
          onClick={() => toggleSearchPanel(summaryEntry, view.searchResults)}
        >
          <SiteThumbnails sources={view.searchResults} />
          <span>
            {t(
              view.searchResults.length === 1 ? 'messageSearchSummary' : 'messageSearchSummaries',
              { count: view.searchResults.length }
            )}
          </span>
        </div>
      ) : null}
      {streaming ? null : (
        <div className={styles.bottom}>
          <BranchSwitcher versions={versions} disabled={busy} onSelect={onSelectVersion} />
          <div className={clsx(styles.actions, isLast && styles.alwaysShow)}>
            {copyText ? <CopyButton text={copyText} /> : null}
            {responseText && !refused ? (
              <ReadAloudButton messageId={message.id} text={responseText} />
            ) : null}
            <IconButton
              icon={<IconRefreshOutline16 />}
              tooltip={t('regenerate')}
              tooltipPlacement="bottom"
              disabled={busy || refused}
              onClick={() => {
                stopReadAloud()
                regenerateReply(sessionId, message.id)
              }}
            />
            <Menu options={menuOptions}>
              {({ open, toggle }) => (
                <IconButton
                  icon={<IconEllipsisOutline16 />}
                  tooltip={open ? undefined : t('more')}
                  aria-label={t('more')}
                  tooltipPlacement="bottom"
                  disabled={busy || refused}
                  onClick={toggle}
                />
              )}
            </Menu>
          </div>
          {isLast && canContinueReply(message) ? (
            <Button
              variant="outlined"
              size="s"
              className={styles.continueButton}
              disabled={busy}
              onClick={() => {
                stopReadAloud()
                continueReply(sessionId, message.id)
              }}
            >
              {t('continueGenerating')}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  )
})
