import { useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react'
import type {
  GitDiffResult,
  GitLogEntry,
  GitStatusEntry,
} from '../../../electron/preload'
import { buildGitDraft, type GitDraftAction } from '../../lib/gitUtils'
import {
  buildDefaultSavePath,
  buildSessionExportFileName,
  type SessionExportFormat,
} from '../../lib/sessionExport'
import type { Session } from '../../store/sessions'
import {
  buildAskAboutSelectionDraft,
  buildSessionExportContent,
  type AskAboutSelectionPayload,
} from '../../components/chat/chatViewUtils'
import type { AppLanguage, TranslationKey } from '../../lib/i18n'

type UseChatViewActionsParams = {
  language: AppLanguage
  session: Session
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
}

export function useChatViewActions({
  language,
  session,
  t,
}: UseChatViewActionsParams) {
  const [externalDraft, setExternalDraft] = useState<{ id: number; text: string } | null>(null)
  const [exportingFormat, setExportingFormat] = useState<SessionExportFormat | null>(null)
  const [copyingFormat, setCopyingFormat] = useState<SessionExportFormat | null>(null)
  const [sessionExportStatus, setSessionExportStatus] = useState<string | null>(null)
  const [sessionExportError, setSessionExportError] = useState<string | null>(null)
  const [drillTarget, setDrillTarget] = useState<{ toolUseId: string; title: string } | null>(null)

  useEffect(() => {
    setExportingFormat(null)
    setCopyingFormat(null)
    setSessionExportStatus(null)
    setSessionExportError(null)
    setDrillTarget(null)
  }, [session.id])

  const handleAskAboutSelection = (payload: AskAboutSelectionPayload) => {
    setExternalDraft({
      id: Date.now(),
      text: buildAskAboutSelectionDraft(payload, t),
    })
  }

  const handleExportSession = async (format: SessionExportFormat) => {
    const suggestedName = buildSessionExportFileName(session, format)
    const content = buildSessionExportContent(format, session, language)

    setExportingFormat(format)
    setSessionExportStatus(null)
    setSessionExportError(null)

    try {
      const result = await window.claude.saveTextFile({
        suggestedName,
        defaultPath: buildDefaultSavePath(session.cwd, suggestedName),
        content,
        filters: format === 'markdown'
          ? [{ name: 'Markdown', extensions: ['md'] }]
          : [{ name: 'JSON', extensions: ['json'] }],
      })

      if (result.ok) {
        setSessionExportStatus(result.path ? t('chatView.savedPath', { path: result.path }) : t('chatView.sessionSaved'))
        return
      }

      if (!result.canceled) {
        setSessionExportError(result.error ?? t('chatView.exportFailed'))
      }
    } catch {
      setSessionExportError(t('chatView.exportFailed'))
    } finally {
      setExportingFormat(null)
    }
  }

  const handleCopySessionExport = async (format: SessionExportFormat) => {
    const content = buildSessionExportContent(format, session, language)

    setCopyingFormat(format)
    setSessionExportStatus(null)
    setSessionExportError(null)

    try {
      await navigator.clipboard.writeText(content)
      setSessionExportStatus(t('chatView.clipboardCopied', { format: format === 'markdown' ? 'Markdown' : 'JSON' }))
    } catch {
      setSessionExportError(t('chatView.clipboardFailed'))
    } finally {
      setCopyingFormat(null)
    }
  }

  const handleCreateGitDraft = (
    action: GitDraftAction,
    payload: {
      entry: GitStatusEntry | null
      commit: GitLogEntry | null
      gitDiff: GitDiffResult | null
    },
  ) => {
    const draft = buildGitDraft(action, payload, language)
    if (!draft) return
    setExternalDraft({ id: Date.now(), text: draft })
  }

  const handleHeaderDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button, a, input, textarea, select, [data-no-drag="true"]')) return
    void window.claude.toggleWindowMaximize()
  }

  return {
    copyingFormat,
    drillTarget,
    exportError: sessionExportError,
    exportStatus: sessionExportStatus,
    exportingFormat,
    externalDraft,
    handleAskAboutSelection,
    handleCopySessionExport,
    handleCreateGitDraft,
    handleExportSession,
    handleHeaderDoubleClick,
    setDrillTarget,
  }
}
