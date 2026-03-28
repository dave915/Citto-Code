import type { SelectedFile } from '../../../electron/preload'
import {
  buildAutoHtmlPreviewInstruction,
  getPermissionApprovalMode,
  getSessionAutoPreviewDirectories,
  isLocalModelSelection,
  normalizeSelectedFolder,
  resolveEnvVarsForModel,
  shouldAutoGenerateHtmlPreview,
} from '../../lib/claudeRuntime'
import { buildPromptWithAttachments, formatAttachedFilesSummary, toAttachedFiles } from '../../lib/attachmentPrompts'
import { translate, type AppLanguage } from '../../lib/i18n'
import { nanoid } from '../../store/nanoid'
import { useSessionsStore, type Session } from '../../store/sessions'
import type {
  ClaudeSessionHandlerDeps,
  HandleSendForSession,
  HandleSendOptions,
} from './types'

function getUiLanguage(): AppLanguage {
  return typeof document !== 'undefined' && document.documentElement.lang.startsWith('en') ? 'en' : 'ko'
}

async function waitForClaudeSessionId(tabId: string, timeoutMs = 1500): Promise<string | null> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const sessionId = useSessionsStore.getState().sessions.find((item) => item.id === tabId)?.sessionId ?? null
    if (sessionId) return sessionId
    await new Promise((resolve) => window.setTimeout(resolve, 40))
  }
  return useSessionsStore.getState().sessions.find((item) => item.id === tabId)?.sessionId ?? null
}

async function cleanupSessionAutoPreviewDirectories(session: Session, remainingSessions: Session[]) {
  const previewDirectories = getSessionAutoPreviewDirectories(session)
  if (previewDirectories.length === 0) return

  const retainedDirectories = new Set(
    remainingSessions
      .flatMap(getSessionAutoPreviewDirectories)
      .map((path) => path.replace(/\\/g, '/').toLowerCase()),
  )

  await Promise.all(
    previewDirectories
      .filter((path) => !retainedDirectories.has(path.replace(/\\/g, '/').toLowerCase()))
      .map(async (targetPath) => {
        try {
          const result = await window.claude.deletePath({ targetPath, recursive: true })
          if (!result.ok && result.error) {
            console.warn(`Failed to delete preview directory: ${targetPath}`, result.error)
          }
        } catch (error) {
          console.warn(`Failed to delete preview directory: ${targetPath}`, error)
        }
      }),
  )
}

function sessionHasConversationHistory(session: Session) {
  return session.messages.some((message) => (
    Boolean(message.text.trim())
    || Boolean(message.thinking?.trim())
    || message.toolCalls.length > 0
    || (message.attachedFiles?.length ?? 0) > 0
    || (message.btwCards?.length ?? 0) > 0
  ))
}

export function createClaudeSessionHandlers({
  activeSession,
  activeSessionId,
  claudeBinaryPath,
  defaultProjectPath,
  runtime,
  sanitizedEnvVars,
  sessions,
}: ClaudeSessionHandlerDeps) {
  const handleSendForSession: HandleSendForSession = async (
    sessionId: string,
    text: string,
    files: SelectedFile[],
    options?: HandleSendOptions,
  ) => {
    const session = useSessionsStore.getState().sessions.find((item) => item.id === sessionId)
    if (!session || session.isStreaming) return
    runtime.abortedTabIdsRef.current.delete(sessionId)
    const uiLanguage = getUiLanguage()

    let fullPrompt = options?.skipAutoTransforms
      ? text
      : buildPromptWithAttachments(text, files, uiLanguage, {
          includeImageReferences: false,
        })

    const autoHtmlPreviewEnabled = useSessionsStore.getState().autoHtmlPreview
    if (!options?.skipAutoTransforms && shouldAutoGenerateHtmlPreview(text, files, autoHtmlPreviewEnabled)) {
      const autoPreviewInstruction = buildAutoHtmlPreviewInstruction(
        text,
        session.cwd && session.cwd !== '~' ? session.cwd : '~',
        uiLanguage,
      )
      fullPrompt = fullPrompt.trim()
        ? `${fullPrompt}\n\n${autoPreviewInstruction}`
        : autoPreviewInstruction
    }

    const visibleFiles = toAttachedFiles(files)

    runtime.storeRef.current.addUserMessage(
      sessionId,
      options?.visibleTextOverride ?? (text || formatAttachedFilesSummary(files.length, uiLanguage)),
      visibleFiles.length > 0 ? visibleFiles : undefined,
    )

    runtime.storeRef.current.setError(sessionId, null)
    runtime.storeRef.current.setPendingPermission(sessionId, null)
    runtime.storeRef.current.setPendingQuestion(sessionId, null)
    runtime.storeRef.current.updateSession(sessionId, () => ({ modelSwitchNotice: null }))
    runtime.storeRef.current.setStreaming(sessionId, true)

    const assistantMessageId = runtime.storeRef.current.startAssistantMessage(sessionId)
    runtime.currentAsstMsgRef.current.set(sessionId, assistantMessageId)

    if (!session.sessionId) {
      runtime.pendingTabIdRef.current = sessionId
    } else {
      runtime.claudeSessionToTabRef.current.set(session.sessionId, sessionId)
    }

    try {
      const effectiveEnvVars = resolveEnvVarsForModel(
        session.model,
        Object.keys(sanitizedEnvVars).length > 0 ? sanitizedEnvVars : {},
      )
      const effectivePlanMode = options?.planModeOverride ?? session.planMode

      const result = await window.claude.sendMessage({
        sessionId: session.sessionId ?? null,
        tabId: sessionId,
        prompt: fullPrompt,
        attachments: files,
        cwd: session.cwd && session.cwd !== '~' ? session.cwd : '~',
        permissionMode: options?.permissionModeOverride ?? session.permissionMode,
        planMode: effectivePlanMode,
        model: session.model ?? undefined,
        envVars: effectiveEnvVars,
        claudePath: claudeBinaryPath || undefined,
      })
      if (result?.tempKey) {
        runtime.pendingProcessKeyByTabRef.current.set(sessionId, result.tempKey)
      }
    } catch (error) {
      runtime.storeRef.current.setError(sessionId, String(error))
      runtime.pendingProcessKeyByTabRef.current.delete(sessionId)
      runtime.pendingTabIdRef.current = null
      runtime.currentAsstMsgRef.current.delete(sessionId)
    }
  }

  const handleBtwForSession = async (
    sessionId: string,
    text: string,
    files: SelectedFile[],
  ) => {
    const session = useSessionsStore.getState().sessions.find((item) => item.id === sessionId)
    if (!session) return
    const uiLanguage = getUiLanguage()
    const fullPrompt = buildPromptWithAttachments(text, files, uiLanguage, {
      includeImageReferences: false,
    })
    const requestId = nanoid()
    const messageId = runtime.storeRef.current.addBtwCard(sessionId, requestId, text)
    runtime.btwRequestMapRef.current.set(requestId, {
      requestId,
      messageId,
      processKey: null,
      prompt: text,
      tabId: sessionId,
    })

    let effectiveClaudeSessionId = session.sessionId ?? null
    if (session.isStreaming && !effectiveClaudeSessionId) {
      effectiveClaudeSessionId = await waitForClaudeSessionId(sessionId)
      if (!effectiveClaudeSessionId) {
        runtime.storeRef.current.updateBtwCard(sessionId, requestId, {
          answer: translate(uiLanguage, 'input.btw.sessionUnavailable'),
          isStreaming: false,
        })
        runtime.btwRequestMapRef.current.delete(requestId)
        return
      }
    }

    try {
      const effectiveEnvVars = resolveEnvVarsForModel(
        session.model,
        Object.keys(sanitizedEnvVars).length > 0 ? sanitizedEnvVars : {},
      )

      const result = await window.claude.sendMessage({
        sessionId: effectiveClaudeSessionId,
        tabId: sessionId,
        prompt: fullPrompt,
        attachments: files,
        cwd: session.cwd && session.cwd !== '~' ? session.cwd : '~',
        requestId,
        allowConcurrent: true,
        permissionMode: session.permissionMode,
        planMode: session.planMode,
        model: session.model ?? undefined,
        envVars: effectiveEnvVars,
        claudePath: claudeBinaryPath || undefined,
      })

      if (result?.tempKey) {
        const current = runtime.btwRequestMapRef.current.get(requestId)
        if (current) {
          runtime.btwRequestMapRef.current.set(requestId, {
            ...current,
            processKey: result.tempKey,
          })
        }
      }
    } catch (error) {
      runtime.btwRequestMapRef.current.delete(requestId)
      runtime.storeRef.current.updateBtwCard(sessionId, requestId, {
        answer: String(error),
        isStreaming: false,
      })
    }
  }

  const handleSend = async (
    text: string,
    files: SelectedFile[],
    options?: HandleSendOptions,
  ) => {
    if (!activeSessionId) return
    await handleSendForSession(activeSessionId, text, files, options)
  }

  const handleRemoveSession = (sessionId: string) => {
    const session = useSessionsStore.getState().sessions.find((item) => item.id === sessionId)
    if (!session) return

    const remainingSessions = useSessionsStore.getState().sessions.filter((item) => item.id !== sessionId)

    for (const [requestId, context] of runtime.btwRequestMapRef.current.entries()) {
      if (context.tabId !== sessionId) continue
      runtime.btwRequestMapRef.current.delete(requestId)
      if (!context.processKey) continue
      void window.claude.abort({ sessionId: context.processKey }).catch(() => undefined)
    }

    if (session.sessionId) {
      runtime.claudeSessionToTabRef.current.delete(session.sessionId)
    }

    runtime.pendingProcessKeyByTabRef.current.delete(sessionId)
    runtime.currentAsstMsgRef.current.delete(sessionId)
    runtime.abortedTabIdsRef.current.delete(sessionId)
    runtime.scheduledTaskRunMetaBySessionRef.current.delete(sessionId)
    runtime.notifiedSessionEndsRef.current.delete(sessionId)
    if (runtime.pendingTabIdRef.current === sessionId) {
      runtime.pendingTabIdRef.current = null
    }

    runtime.storeRef.current.removeSession(sessionId)
    void cleanupSessionAutoPreviewDirectories(session, remainingSessions)
  }

  const handleModelChange = (sessionId: string, nextModel: string | null) => {
    const session = useSessionsStore.getState().sessions.find((item) => item.id === sessionId)
    if (!session) return
    if (session.model === nextModel) return

    const backendChanged = isLocalModelSelection(session.model) !== isLocalModelSelection(nextModel)

    if (session.sessionId) {
      runtime.claudeSessionToTabRef.current.delete(session.sessionId)
    }

    runtime.storeRef.current.updateSession(sessionId, () => ({
      model: nextModel,
      sessionId: null,
      error: null,
      modelSwitchNotice: backendChanged && (session.sessionId !== null || sessionHasConversationHistory(session))
        ? {
            kind: 'backend',
            fromModel: session.model,
            toModel: nextModel,
            createdAt: Date.now(),
          }
        : null,
    }))
  }

  const handleAbort = async () => {
    if (!activeSessionId) return
    const processKey = runtime.pendingProcessKeyByTabRef.current.get(activeSessionId) ?? activeSession?.sessionId
    if (!processKey) return

    runtime.abortedTabIdsRef.current.add(activeSessionId)
    await window.claude.abort({ sessionId: processKey })
    runtime.pendingProcessKeyByTabRef.current.delete(activeSessionId)
    if (runtime.pendingTabIdRef.current === activeSessionId) {
      runtime.pendingTabIdRef.current = null
    }
    runtime.currentAsstMsgRef.current.delete(activeSessionId)
    runtime.storeRef.current.commitStreamEnd(activeSessionId)
  }

  const handlePermissionRequestAction = async (action: 'once' | 'always' | 'deny') => {
    if (!activeSession || !activeSessionId || !activeSession.pendingPermission || activeSession.isStreaming) return

    const request = activeSession.pendingPermission
    runtime.storeRef.current.setPendingPermission(activeSessionId, null)

    if (action === 'deny') return

    const nextPermissionMode = getPermissionApprovalMode(request)
    if (action === 'always' && activeSession.permissionMode !== nextPermissionMode) {
      runtime.storeRef.current.setPermissionMode(activeSessionId, nextPermissionMode)
    }
    const uiLanguage = getUiLanguage()

    await handleSendForSession(
      activeSessionId,
      translate(uiLanguage, 'claudeStream.permissionContinuePrompt'),
      [],
      {
        permissionModeOverride: nextPermissionMode,
        planModeOverride: false,
        visibleTextOverride: action === 'always'
          ? translate(uiLanguage, 'claudeStream.permissionContinue')
          : translate(uiLanguage, 'claudeStream.permissionContinueOnce'),
      },
    )
  }

  const handleQuestionResponse = async (answer: string | null) => {
    if (!activeSession || !activeSessionId || !activeSession.pendingQuestion || activeSession.isStreaming) return

    runtime.storeRef.current.setPendingQuestion(activeSessionId, null)

    if (!answer?.trim()) return

    await handleSendForSession(activeSessionId, answer.trim(), [], {
      visibleTextOverride: answer.trim(),
    })
  }

  const handleSelectFolder = async (sessionId?: string) => {
    const targetSessionId = sessionId ?? activeSessionId
    if (!targetSessionId) return

    const session = sessions.find((item) => item.id === targetSessionId)
    const folder = normalizeSelectedFolder(await window.claude.selectFolder({
      defaultPath: session?.cwd || defaultProjectPath,
      title: translate(getUiLanguage(), 'app.selectProjectFolderTitle'),
    }))
    if (!folder) return

    runtime.storeRef.current.updateSession(targetSessionId, () => ({
      cwd: folder,
      name: folder.split(/[\\/]/).filter(Boolean).pop() || folder,
    }))
  }

  return {
    handleAbort,
    handleBtwForSession,
    handleModelChange,
    handlePermissionRequestAction,
    handleQuestionResponse,
    handleRemoveSession,
    handleSelectFolder,
    handleSend,
    handleSendForSession,
  }
}
