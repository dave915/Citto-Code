import { useEffect, useMemo, useState } from 'react'
import type { McpConfigScope, McpReadResult } from '../../../electron/preload'
import { getProjectNameFromPath, useSessionsStore } from '../../store/sessions'
import {
  EMPTY_MCP_FORM,
  EmptyState,
  LoadingPlaceholder,
  normalizeProjectPath,
  type McpForm,
  type McpServer,
} from './shared'
import { McpScopePanel } from './McpScopePanel'
import { McpServerCard } from './McpServerCard'
import { McpServerForm } from './McpServerForm'
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

function validateMcpForm(form: McpForm): string {
  const name = form.name.trim()
  if (!name) return '이름을 입력하세요.'
  if (form.serverType === 'stdio' && !form.command.trim()) return '커맨드를 입력하세요.'
  if (form.serverType !== 'stdio' && !form.url.trim()) return 'URL을 입력하세요.'
  return ''
}

export function McpTab({ projectPath }: { projectPath: string | null }) {
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

  useEffect(() => {
    if (!selectedProjectPath.trim() && currentProjectPath) {
      setSelectedProjectPath(currentProjectPath)
    }
  }, [currentProjectPath, selectedProjectPath])

  useEffect(() => {
    let cancelled = false

    window.claude.listProjectPaths()
      .then((projectPaths) => {
        if (cancelled) return
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
        if (cancelled) return
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

  const loadServers = () => {
    setLoading(true)

    if (scope !== 'user' && !effectiveProjectPath) {
      setScopeInfo(buildUnavailableScopeInfo(scope, null, '프로젝트를 선택해야 이 범위를 편집할 수 있습니다.'))
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

    request
      .then((result) => {
        setScopeInfo(result)
        setRawMcp(result.mcpServers)
        setServers(mapMcpServers(result.mcpServers))
      })
      .catch(() => {
        setScopeInfo(buildUnavailableScopeInfo(scope, effectiveProjectPath, 'MCP 설정을 불러오지 못했습니다.'))
        setRawMcp({})
        setServers([])
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadServers()
    setShowAdd(false)
    setForm(EMPTY_MCP_FORM)
    setFormError('')
    setEditingServer(null)
    setEditForm(EMPTY_MCP_FORM)
    setEditError('')
    setConfirmDelete(null)
  }, [scope, effectiveProjectPath])

  const upsertScopedServer = async (name: string, entry: Record<string, unknown>, previousName?: string) => {
    if (scope === 'user') {
      const base = previousName && previousName !== name
        ? Object.fromEntries(Object.entries(rawMcp).filter(([key]) => key !== previousName))
        : rawMcp
      return window.claude.writeMcpServers({ scope: 'user', mcpServers: { ...base, [name]: entry } })
    }

    if (!effectiveProjectPath) {
      return { ok: false, error: '프로젝트를 선택해야 저장할 수 있습니다.' }
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
  }

  const deleteScopedServer = (name: string) => {
    if (scope === 'user') {
      const { [name]: _deleted, ...rest } = rawMcp
      return window.claude.writeMcpServers({ scope: 'user', mcpServers: rest })
    }

    if (!effectiveProjectPath) {
      return Promise.resolve({ ok: false, error: '프로젝트를 선택해야 삭제할 수 있습니다.' })
    }

    return scope === 'local'
      ? window.claude.deleteProjectMcpServer({ projectPath: effectiveProjectPath, name })
      : window.claude.deleteDotMcpServer({ projectPath: effectiveProjectPath, name })
  }

  const handleSave = async () => {
    if (!canManageScope) {
      setFormError('현재 범위를 편집할 수 없습니다.')
      return
    }
    const validationError = validateMcpForm(form)
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
      setFormError(result.error ?? '저장 실패')
      return
    }

    setShowAdd(false)
    setForm(EMPTY_MCP_FORM)
    loadServers()
  }

  const handleEditStart = (server: McpServer) => {
    if (editingServer === server.name) {
      setEditingServer(null)
      return
    }
    setShowAdd(false)
    setConfirmDelete(null)
    setEditingServer(server.name)
    setEditForm(serverToForm(server))
    setEditError('')
  }

  const handleEditSave = async () => {
    if (!editingServer) return
    if (!canManageScope) {
      setEditError('현재 범위를 편집할 수 없습니다.')
      return
    }
    const validationError = validateMcpForm(editForm)
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
      setEditError(result.error ?? '저장 실패')
      return
    }

    setEditingServer(null)
    loadServers()
  }

  const handleDelete = async (name: string) => {
    if (!canManageScope) return
    const result = await deleteScopedServer(name)
    if (!result.ok) return
    setConfirmDelete(null)
    if (editingServer === name) setEditingServer(null)
    loadServers()
  }

  if (loading) return <LoadingPlaceholder />

  return (
    <div className="space-y-3 p-4">
      <McpScopePanel
        scope={scope}
        scopeInfo={scopeInfo}
        availableProjectPaths={availableProjectPaths}
        selectedProjectPath={selectedProjectPath}
        effectiveProjectPath={effectiveProjectPath}
        currentProjectName={currentProjectName}
        canManageScope={canManageScope}
        onScopeChange={setScope}
        onSelectedProjectPathChange={setSelectedProjectPath}
      />

      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs text-claude-muted">
          {scope === 'user' ? '공통 MCP 서버 목록' : scope === 'local' ? '선택한 프로젝트 전용 MCP 서버 목록' : '선택한 프로젝트의 공유 MCP 서버 목록'}
        </p>
        <button
          onClick={() => {
            setShowAdd(true)
            setEditingServer(null)
            setConfirmDelete(null)
            setForm(EMPTY_MCP_FORM)
            setFormError('')
          }}
          disabled={!canManageScope}
          className="flex items-center gap-1 rounded-lg bg-claude-surface px-2.5 py-1 text-xs font-medium text-claude-text transition-colors hover:bg-claude-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          추가
        </button>
      </div>

      {showAdd && (
        <McpServerForm
          title="새 MCP 서버 추가"
          form={form}
          error={formError}
          saving={saving}
          submitLabel="저장"
          onChange={setForm}
          onSubmit={handleSave}
          onCancel={() => setShowAdd(false)}
          autoFocusName
        />
      )}

      {!canManageScope && !showAdd ? (
        <EmptyState
          icon="📁"
          title="프로젝트 범위 사용 불가"
          desc={<>대상 프로젝트 폴더를 먼저 선택해야 이 범위를 편집할 수 있습니다.</>}
        />
      ) : servers.length === 0 && !showAdd ? (
        <EmptyState
          icon="🔌"
          title="MCP 서버 없음"
          desc={<>오른쪽 상단 추가 버튼으로 서버를 등록하세요.</>}
        />
      ) : (
        servers.map((server) => {
          return (
            <McpServerCard
              key={server.name}
              server={server}
              editing={editingServer === server.name}
              confirmDelete={confirmDelete === server.name}
              editForm={editForm}
              editError={editError}
              editSaving={editSaving}
              onEditToggle={() => handleEditStart(server)}
              onEditFormChange={setEditForm}
              onEditSave={handleEditSave}
              onEditCancel={() => setEditingServer(null)}
              onDeleteRequest={() => {
                setConfirmDelete(server.name)
                setShowAdd(false)
              }}
              onDeleteConfirm={() => handleDelete(server.name)}
              onDeleteCancel={() => setConfirmDelete(null)}
            />
          )
        })
      )}
    </div>
  )
}
