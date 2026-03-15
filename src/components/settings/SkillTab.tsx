import { useEffect, useRef, useState } from 'react'
import type { PluginSkill } from '../../../electron/preload'
import { useI18n } from '../../hooks/useI18n'
import { EmptyState, LoadingPlaceholder } from './shared'
import { PluginSkillList } from './skill/PluginSkillList'
import { SkillAddForm } from './skill/SkillAddForm'
import { SkillIntroCard } from './skill/SkillIntroCard'

type Skill = { name: string; path: string; dir: string; legacy: boolean }

export function SkillTab() {
  const { language } = useI18n()
  const [skills, setSkills] = useState<Skill[]>([])
  const [pluginSkills, setPluginSkills] = useState<PluginSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null)
  const [skillFiles, setSkillFiles] = useState<Record<string, { name: string; path: string }[]>>({})
  const [addFileFor, setAddFileFor] = useState<{ name: string; dir: string } | null>(null)
  const [newFileName, setNewFileName] = useState('')
  const [fileFormError, setFileFormError] = useState('')
  const [creatingFile, setCreatingFile] = useState(false)
  const fileNameRef = useRef<HTMLInputElement>(null)

  const [editingFile, setEditingFile] = useState<{ name: string; path: string } | null>(null)
  const [editContent, setEditContent] = useState('')
  const [loadingEdit, setLoadingEdit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const loadSkills = () => {
    setLoading(true)
    Promise.all([
      window.claude.listSkills().catch(() => []),
      window.claude.listPluginSkills().catch(() => []),
    ])
      .then(([loadedSkills, loadedPluginSkills]) => {
        setSkills(loadedSkills)
        setPluginSkills(loadedPluginSkills)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadSkills()
  }, [])

  useEffect(() => {
    if (showAdd) setTimeout(() => nameRef.current?.focus(), 50)
  }, [showAdd])

  useEffect(() => {
    if (addFileFor) setTimeout(() => fileNameRef.current?.focus(), 50)
  }, [addFileFor])

  const loadSkillFiles = (skill: Skill) => {
    window.claude.listDirAbs(skill.dir)
      .then((files) => {
        setSkillFiles((previous) => ({ ...previous, [skill.name]: files }))
      })
      .catch(() => undefined)
  }

  const handleDelete = async (skill: Skill) => {
    const result = await window.claude.deletePath({ targetPath: skill.dir, recursive: true })
    if (!result.ok) return
    setConfirmDelete(null)
    if (expandedSkill === skill.name) setExpandedSkill(null)
    if (editingFile) setEditingFile(null)
    loadSkills()
  }

  const handleExpand = (skill: Skill) => {
    if (expandedSkill === skill.name) {
      setExpandedSkill(null)
      setAddFileFor(null)
      setEditingFile(null)
      return
    }

    setExpandedSkill(skill.name)
    setAddFileFor(null)
    setEditingFile(null)
    loadSkillFiles(skill)
  }

  const handleEditFile = async (file: { name: string; path: string }) => {
    setEditingFile({ name: file.name, path: file.path })
    setAddFileFor(null)
    setSaveError('')
    setLoadingEdit(true)
    const result = await window.claude.readFile(file.path)
    setLoadingEdit(false)
    setEditContent(result?.content ?? '')
  }

  const handleSaveFile = async () => {
    if (!editingFile) return
    setSaving(true)
    setSaveError('')
    const result = await window.claude.writeFileAbs({ filePath: editingFile.path, content: editContent })
    setSaving(false)
    if (!result.ok) {
      setSaveError(result.error ?? (language === 'en' ? 'Save failed' : '저장 실패'))
      return
    }
    setEditingFile(null)
  }

  const handleCreate = async () => {
    const raw = newName.trim()
    if (!raw) {
      setFormError(language === 'en' ? 'Enter a name.' : '이름을 입력하세요.')
      return
    }
    const skillName = raw.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 64)
    const content = language === 'en'
      ? `---\nname: ${skillName}\ndescription: Describe this skill and when to use it.\n---\n\n# ${skillName}\n\nWrite the skill instructions here.\n`
      : `---\nname: ${skillName}\ndescription: 이 Skill에 대한 설명과 사용 시기를 입력하세요.\n---\n\n# ${skillName}\n\nSkill 지침을 여기에 작성하세요.\n`
    setCreating(true)
    setFormError('')
    const result = await window.claude.writeClaudeFile({ subdir: `skills/${skillName}`, name: 'SKILL.md', content })
    setCreating(false)
    if (!result.ok) {
      setFormError(result.error ?? (language === 'en' ? 'Create failed' : '생성 실패'))
      return
    }
    setShowAdd(false)
    setNewName('')
    loadSkills()
    if (result.path) window.claude.openFile(result.path)
  }

  const handleCreateFile = async () => {
    if (!addFileFor) return
    const fileName = newFileName.trim()
    if (!fileName) {
      setFileFormError(language === 'en' ? 'Enter a file name.' : '파일 이름을 입력하세요.')
      return
    }
    const filePath = `${addFileFor.dir}/${fileName}`
    const baseName = fileName.split('/').pop() ?? fileName
    const content = fileName.endsWith('.md') ? `# ${baseName.replace(/\.md$/, '')}\n\n${language === 'en' ? 'Write content here.' : '내용을 입력하세요.'}\n` : ''
    setCreatingFile(true)
    setFileFormError('')
    const result = await window.claude.writeFileAbs({ filePath, content })
    setCreatingFile(false)
    if (!result.ok) {
      setFileFormError(result.error ?? (language === 'en' ? 'Create failed' : '생성 실패'))
      return
    }
    setAddFileFor(null)
    setNewFileName('')
    const skillForReload = skills.find((skill) => skill.name === addFileFor.name)
    if (skillForReload) loadSkillFiles(skillForReload)
    if (result.path) {
      await handleEditFile({ name: fileName, path: result.path })
    }
  }

  if (loading) return <LoadingPlaceholder />

  return (
    <div className="p-4">
      <SkillIntroCard />

      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-claude-muted">{language === 'en' ? 'Skills registered in ~/.claude/skills/' : '~/.claude/skills/ 에 등록된 Skill'}</p>
        <button
          onClick={() => {
            setShowAdd(true)
            setNewName('')
            setFormError('')
          }}
          className="flex items-center gap-1 rounded-lg bg-claude-surface px-2.5 py-1 text-xs font-medium text-claude-text transition-colors hover:bg-claude-surface-2"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {language === 'en' ? 'Add' : '추가'}
        </button>
      </div>

      <SkillAddForm
        open={showAdd}
        name={newName}
        creating={creating}
        error={formError}
        nameRef={nameRef}
        onNameChange={setNewName}
        onCreate={handleCreate}
        onCancel={() => setShowAdd(false)}
      />

      {skills.length === 0 ? (
        <EmptyState icon="⚡" title={language === 'en' ? 'No skills defined' : '정의된 Skill 없음'} desc={<>{language === 'en' ? 'Use the add button to create a custom command.' : '추가 버튼으로 커스텀 명령어를 만들 수 있습니다.'}</>} />
      ) : (
        <div className="space-y-2">
          {skills.map((skill) => {
            const isExpanded = expandedSkill === skill.name
            const files = skillFiles[skill.name] ?? []
            return (
              <div key={skill.path} className="overflow-hidden rounded-xl border border-claude-border bg-claude-bg">
                <div className="flex items-center gap-3 p-3">
                  <span className="flex-shrink-0 text-base">⚡</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-claude-text">/{skill.name}</p>
                      {skill.legacy && (
                        <span className="flex-shrink-0 rounded border border-claude-border bg-claude-panel px-1.5 py-0.5 text-xs text-claude-muted">
                          legacy
                        </span>
                      )}
                    </div>
                    <p className="truncate font-mono text-xs text-claude-muted">
                      {skill.legacy ? `commands/${skill.name}` : `skills/${skill.name}/SKILL.md`}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    {confirmDelete === skill.name ? (
                      <>
                        <span className="mr-1 text-xs text-red-500">{language === 'en' ? 'Delete?' : '삭제?'}</span>
                        <button
                          onClick={() => void handleDelete(skill)}
                          className="rounded-lg bg-red-500 px-2 py-1 text-xs text-white transition-colors hover:bg-red-600"
                        >
                          {language === 'en' ? 'Confirm' : '확인'}
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="rounded-lg border border-claude-border px-2 py-1 text-xs text-claude-muted transition-colors hover:text-claude-text"
                        >
                          {language === 'en' ? 'Cancel' : '취소'}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => setConfirmDelete(skill.name)}
                          className="rounded p-1.5 text-claude-muted transition-colors hover:bg-claude-panel hover:text-red-500"
                          title={language === 'en' ? 'Delete' : '삭제'}
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                        <button
                          onClick={() => window.claude.openFile(skill.path)}
                          className="rounded p-1.5 text-claude-muted transition-colors hover:bg-claude-panel hover:text-claude-text"
                          title={language === 'en' ? 'Open in external editor' : '외부 에디터로 열기'}
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleExpand(skill)}
                          className="rounded p-1.5 text-claude-muted transition-colors hover:bg-claude-panel hover:text-claude-text"
                          title={language === 'en' ? 'Files' : '파일 목록'}
                        >
                          <svg className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-claude-border bg-claude-panel">
                    <div className="px-4 py-2">
                      {files.length === 0 ? (
                        <p className="py-1 text-xs text-claude-muted">{language === 'en' ? 'No files' : '파일 없음'}</p>
                      ) : (
                        <div className="space-y-0.5">
                          {files.map((file) => {
                            const isEditing = editingFile?.path === file.path
                            return (
                              <div
                                key={file.path}
                                className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors ${
                                  isEditing ? 'bg-claude-surface' : 'hover:bg-claude-bg'
                                }`}
                              >
                                <svg className="h-3 w-3 flex-shrink-0 text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <span className={`flex-1 truncate text-xs font-mono ${isEditing ? 'font-semibold text-claude-text' : 'text-claude-text'}`}>
                                  {file.name}
                                </span>
                                <div className="flex flex-shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                  <button
                                    onClick={() => void handleEditFile(file)}
                                    className="rounded p-1 text-claude-muted transition-colors hover:bg-claude-panel hover:text-claude-text"
                                    title={language === 'en' ? 'Edit in app' : '앱에서 편집'}
                                  >
                                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={() => window.claude.openFile(file.path)}
                                    className="rounded p-1 text-claude-muted transition-colors hover:bg-claude-panel hover:text-claude-text"
                                    title={language === 'en' ? 'Open in external editor' : '외부 에디터로 열기'}
                                  >
                                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {editingFile && (
                      <div className="border-t border-claude-border bg-claude-surface px-4 py-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs font-mono font-semibold text-claude-text">{editingFile.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-claude-muted">⌘S {language === 'en' ? 'save' : '저장'}</span>
                            <button
                              onClick={() => setEditingFile(null)}
                              className="rounded p-0.5 text-claude-muted transition-colors hover:text-claude-text"
                            >
                              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        {loadingEdit ? (
                          <div className="flex h-24 items-center justify-center text-claude-muted">
                            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                            </svg>
                          </div>
                        ) : (
                          <textarea
                            value={editContent}
                            onChange={(event) => setEditContent(event.target.value)}
                            onKeyDown={(event) => {
                              if ((event.metaKey || event.ctrlKey) && event.key === 's') {
                                event.preventDefault()
                                void handleSaveFile()
                              }
                            }}
                            className="h-56 w-full resize-y rounded-lg border border-claude-border bg-claude-panel px-3 py-2 text-xs font-mono leading-relaxed focus:border-claude-border focus:outline-none focus:ring-1 focus:ring-white/10"
                            spellCheck={false}
                          />
                        )}
                        {saveError && <p className="mt-1 text-xs text-red-500">{saveError}</p>}
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={() => void handleSaveFile()}
                            disabled={saving || loadingEdit}
                            className="rounded-lg bg-claude-surface-2 px-3 py-1.5 text-xs font-medium text-claude-text transition-colors hover:bg-[#44444a] disabled:opacity-50"
                          >
                            {saving ? (language === 'en' ? 'Saving...' : '저장 중...') : (language === 'en' ? 'Save' : '저장')}
                          </button>
                          <button
                            onClick={() => setEditingFile(null)}
                            className="rounded-lg border border-claude-border px-3 py-1.5 text-xs text-claude-muted transition-colors hover:text-claude-text"
                          >
                            {language === 'en' ? 'Cancel' : '취소'}
                          </button>
                        </div>
                      </div>
                    )}

                    {!editingFile && (
                      <div className="border-t border-claude-border/40 px-4 pb-3">
                        {addFileFor?.name === skill.name ? (
                          <div className="space-y-2 pt-2">
                            <p className="text-xs font-medium text-claude-text">{language === 'en' ? 'Add file' : '파일 추가'}</p>
                            <input
                              ref={fileNameRef}
                              value={newFileName}
                              onChange={(event) => setNewFileName(event.target.value)}
                              onKeyDown={(event) => event.key === 'Enter' && void handleCreateFile()}
                              placeholder={language === 'en' ? 'template.md or examples/sample.md' : 'template.md 또는 examples/sample.md'}
                              className="w-full rounded-lg border border-claude-border bg-claude-panel px-3 py-2 text-xs font-mono focus:border-claude-border focus:outline-none focus:ring-1 focus:ring-white/10"
                            />
                            {fileFormError && <p className="text-xs text-red-500">{fileFormError}</p>}
                            <div className="flex gap-2">
                              <button
                                onClick={() => void handleCreateFile()}
                                disabled={creatingFile}
                                className="rounded-lg bg-claude-surface-2 px-3 py-1.5 text-xs font-medium text-claude-text transition-colors hover:bg-[#44444a] disabled:opacity-50"
                              >
                                {creatingFile ? (language === 'en' ? 'Creating...' : '생성 중...') : (language === 'en' ? 'Create' : '생성')}
                              </button>
                              <button
                                onClick={() => setAddFileFor(null)}
                                className="rounded-lg border border-claude-border px-3 py-1.5 text-xs text-claude-muted transition-colors hover:text-claude-text"
                              >
                                {language === 'en' ? 'Cancel' : '취소'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setAddFileFor({ name: skill.name, dir: skill.dir })
                              setNewFileName('')
                              setFileFormError('')
                            }}
                            className="mt-2 flex items-center gap-1 text-xs text-claude-muted transition-colors hover:text-claude-text"
                          >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            </svg>
                            {language === 'en' ? 'Add file' : '파일 추가'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <PluginSkillList skills={pluginSkills} />
    </div>
  )
}
