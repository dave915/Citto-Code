import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { McpConfigScope, McpReadResult } from '../../../electron/preload'
import { useI18n } from '../../hooks/useI18n'
import { translate, type AppLanguage } from '../../lib/i18n'
import { getProjectNameFromPath, useSessionsStore } from '../../store/sessions'
import {
  EMPTY_MCP_FORM,
  normalizeProjectPath,
  type McpForm,
  type McpServer,
} from './shared'
import { buildEntry, mapMcpServers, serverToForm } from './mcpUtils'

function buildUnavailableScopeInfo(
  scope: McpConfigScope,
  projectPath: string | null,
  message: string,
): McpReadResult {
  return {
    scope,
    available: false,
    targetPath: scope === 'project' ? '.mcp.json' : '~/.claude.json',
    projectPath,
    mcpServers: {},
    message,
  }
}

function validateMcpForm(form: McpForm, language: AppLanguage): string {
  const name = form.name.trim()
  if (!name) return translate(language, 'settings.mcp.enterName')
  if (form.serverType === 'stdio' && !form.command.trim()) return translate(language, 'settings.mcp.enterCommand')
  if (form.serverType !== 'stdio' && !form.url.trim()) return translate(language, 'settings.mcp.enterUrl')
  return ''
}

export function useMcpTabState(projectPath: string | null) {
  const { language, t } = useI18n()
  const sessions = useSessionsStore((state) => state.sessions)
  const defaultProjectPath = useSessionsStore((state) => state.defaultProjectPath)
  const currentProjectPath = useMemo(() => {
    const activePath = normalizeProjectPath(projectPath ?? '')
    if (activePath) return activePath
    return normalizeProjectPath(defaultProjectPath)
  }, [defaultProjectPath, projectPath])
  const sessionProjectPaths = useMemo(() => (
    Array.from(new Set(
      sessions
        .map((session) => normalizeProjectPath(session.cwd))
        .filter((value): value is string => Boolean(value)),
    )).sort((a, b) => a.localeCompare(b))
  ), [sessions])

  const [scope, setScope] = useState<McpConfigScope>('user')
  const [selectedProjectPath, setSelectedProjectPath] = useState(currentProjectPath ?? '')
  const [availableProjectPaths, setAvailableProjectPaths] = useState<string[]>([])
  const [servers, setServers] = useState<McpServer[]>([])
  const [loading, setLoading] = useState(true)
  const [rawMcp, setRawMcp] = useState<Record<string, unknown>>({})
  const [scopeInfo, setScopeInfo] = useState<McpReadResult | null>(null)

  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState<McpForm>(EMPTY_MCP_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [editingServer, setEditingServer] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<McpForm>(EMPTY_MCP_FORM)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const mountedRef = useRef(true)
  const loadRequestIdRef = useRef(0)

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!selectedProjectPath.trim() && currentProjectPath) {
      setSelectedProjectPath(currentProjectPath)
    }
  }, [currentProjectPath, selectedProjectPath])

  useEffect(() => {
    let cancelled = false

    window.claude.listProjectPaths()
      .then((projectPaths) => {
        if (cancelled || !mountedRef.current) return

        const merged = Array.from(new Set([
          ...(currentProjectPath ? [currentProjectPath] : []),
          ...sessionProjectPaths,
          ...projectPaths
            .map((value) => normalizeProjectPath(value))
            .filter((value): value is string => Boolean(value)),
        ])).sort((a, b) => a.localeCompare(b))
        setAvailableProjectPaths(merged)
      })
      .catch(() => {
        if (cancelled || !mountedRef.current) return

        const fallback = Array.from(new Set([
          ...(currentProjectPath ? [currentProjectPath] : []),
          ...sessionProjectPaths,
        ])).sort((a, b) => a.localeCompare(b))
        setAvailableProjectPaths(fallback)
      })

    return () => {
      cancelled = true
    }
  }, [currentProjectPath, sessionProjectPaths])

  useEffect(() => {
    if (scope === 'user') return
    if (selectedProjectPath && availableProjectPaths.includes(selectedProjectPath)) return
    setSelectedProjectPath(currentProjectPath ?? availableProjectPaths[0] ?? '')
  }, [availableProjectPaths, currentProjectPath, scope, selectedProjectPath])

  const effectiveProjectPath = normalizeProjectPath(selectedProjectPath)
  const canManageScope = scope === 'user'
    ? true
    : Boolean(effectiveProjectPath) && (scopeInfo?.available ?? true)
  const currentProjectLabel = scopeInfo?.projectPath ?? effectiveProjectPath
  const currentProjectName = currentProjectLabel ? getProjectNameFromPath(currentProjectLabel) : null
  const listLabel = scope === 'user'
    ? t('settings.mcp.list.user')
    : scope === 'local'
      ? t('settings.mcp.list.local')
      : t('settings.mcp.list.project')

  const resetEditorState = useCallback(() => {
    setShowAdd(false)
    setForm(EMPTY_MCP_FORM)
    setFormError('')
    setEditingServer(null)
    setEditForm(EMPTY_MCP_FORM)
    setEditError('')
    setConfirmDelete(null)
  }, [])

  const loadServers = useCallback(async () => {
    const requestId = loadRequestIdRef.current + 1
    loadRequestIdRef.current = requestId
    setLoading(true)

    if (scope !== 'user' && !effectiveProjectPath) {
      if (!mountedRef.current || requestId !== loadRequestIdRef.current) return

      setScopeInfo(buildUnavailableScopeInfo(scope, null, t('settings.mcp.chooseProjectBeforeEdit')))
      setRawMcp({})
      setServers([])
      setLoading(false)
      return
    }

    const request = scope === 'user'
      ? window.claude.readMcpServers({ scope: 'user' })
      : scope === 'local'
        ? window.claude.readProjectMcpServers(effectiveProjectPath!)
        : window.claude.readDotMcpServers(effectiveProjectPath!)

    try {
      const result = await request
      if (!mountedRef.current || requestId !== loadRequestIdRef.current) return

      setScopeInfo(result)
      setRawMcp(result.mcpServers)
      setServers(mapMcpServers(result.mcpServers))
    } catch {
      if (!mountedRef.current || requestId !== loadRequestIdRef.current) return

      setScopeInfo(buildUnavailableScopeInfo(scope, effectiveProjectPath, t('settings.mcp.loadFailed')))
      setRawMcp({})
      setServers([])
    } finally {
      if (mountedRef.current && requestId === loadRequestIdRef.current) {
        setLoading(false)
      }
    }
  }, [effectiveProjectPath, scope, t])

  useEffect(() => {
    resetEditorState()
    void loadServers()
  }, [loadServers, resetEditorState])

  const upsertScopedServer = useCallback(async (name: string, entry: Record<string, unknown>, previousName?: string) => {
    if (scope === 'user') {
      const base = previousName && previousName !== name
        ? Object.fromEntries(Object.entries(rawMcp).filter(([key]) => key !== previousName))
        : rawMcp
      return window.claude.writeMcpServers({ scope: 'user', mcpServers: { ...base, [name]: entry } })
    }

    if (!effectiveProjectPath) {
      return { ok: false, error: t('settings.mcp.chooseProjectBeforeSave') }
    }

    if (previousName && previousName !== name) {
      const deleteResult = scope === 'local'
        ? await window.claude.deleteProjectMcpServer({ projectPath: effectiveProjectPath, name: previousName })
        : await window.claude.deleteDotMcpServer({ projectPath: effectiveProjectPath, name: previousName })
      if (!deleteResult.ok) return deleteResult
    }

    return scope === 'local'
      ? window.claude.writeProjectMcpServer({ projectPath: effectiveProjectPath, name, config: entry })
      : window.claude.writeDotMcpServer({ projectPath: effectiveProjectPath, name, config: entry })
  }, [effectiveProjectPath, rawMcp, scope, t])

  const deleteScopedServer = useCallback((name: string) => {
    if (scope === 'user') {
      const { [name]: _deleted, ...rest } = rawMcp
      return window.claude.writeMcpServers({ scope: 'user', mcpServers: rest })
    }

    if (!effectiveProjectPath) {
      return Promise.resolve({ ok: false, error: t('settings.mcp.chooseProjectBeforeDelete') })
    }

    return scope === 'local'
      ? window.claude.deleteProjectMcpServer({ projectPath: effectiveProjectPath, name })
      : window.claude.deleteDotMcpServer({ projectPath: effectiveProjectPath, name })
  }, [effectiveProjectPath, rawMcp, scope, t])

  const openAddForm = useCallback(() => {
    setShowAdd(true)
    setEditingServer(null)
    setConfirmDelete(null)
    setForm(EMPTY_MCP_FORM)
    setFormError('')
  }, [])

  const handleSave = useCallback(async () => {
    if (!canManageScope) {
      setFormError(t('settings.mcp.scopeEditUnavailable'))
      return
    }

    const validationError = validateMcpForm(form, language)
    if (validationError) {
      setFormError(validationError)
      return
    }

    const name = form.name.trim()
    setSaving(true)
    setFormError('')
    const result = await upsertScopedServer(name, buildEntry(form))
    setSaving(false)
    if (!result.ok) {
      setFormError(result.error ?? t('settings.mcp.saveFailed'))
      return
    }

    setShowAdd(false)
    setForm(EMPTY_MCP_FORM)
    void loadServers()
  }, [canManageScope, form, language, loadServers, t, upsertScopedServer])

  const handleEditStart = useCallback((server: McpServer) => {
    if (editingServer === server.name) {
      setEditingServer(null)
      return
    }

    setShowAdd(false)
    setConfirmDelete(null)
    setEditingServer(server.name)
    setEditForm(serverToForm(server))
    setEditError('')
  }, [editingServer])

  const handleEditSave = useCallback(async () => {
    if (!editingServer) return
    if (!canManageScope) {
      setEditError(t('settings.mcp.scopeEditUnavailable'))
      return
    }

    const validationError = validateMcpForm(editForm, language)
    if (validationError) {
      setEditError(validationError)
      return
    }

    const newName = editForm.name.trim()
    setEditSaving(true)
    setEditError('')
    const result = await upsertScopedServer(newName, buildEntry({ ...editForm, name: newName }), editingServer)
    setEditSaving(false)
    if (!result.ok) {
      setEditError(result.error ?? t('settings.mcp.saveFailed'))
      return
    }

    setEditingServer(null)
    void loadServers()
  }, [canManageScope, editForm, editingServer, language, loadServers, t, upsertScopedServer])

  const handleDelete = useCallback(async (name: string) => {
    if (!canManageScope) return

    const result = await deleteScopedServer(name)
    if (!result.ok) return

    setConfirmDelete(null)
    if (editingServer === name) setEditingServer(null)
    void loadServers()
  }, [canManageScope, deleteScopedServer, editingServer, loadServers])

  return {
    availableProjectPaths,
    canManageScope,
    confirmDelete,
    currentProjectName,
    editError,
    editForm,
    editingServer,
    editSaving,
    effectiveProjectPath,
    form,
    formError,
    handleDelete,
    handleEditSave,
    handleEditStart,
    handleSave,
    listLabel,
    loading,
    saving,
    scope,
    scopeInfo,
    selectedProjectPath,
    servers,
    setConfirmDelete,
    setEditForm,
    setEditingServer,
    setForm,
    setScope,
    setSelectedProjectPath,
    setShowAdd,
    showAdd,
    openAddForm,
  }
}
