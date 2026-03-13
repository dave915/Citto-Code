import { useEffect, useRef, useState } from 'react'
import type { RecentProject } from '../../electron/preload'

const MAX_INPUT_HEIGHT = 120

function resizeTextarea(element: HTMLTextAreaElement | null) {
  if (!element) return
  element.style.height = 'auto'
  const nextHeight = Math.min(element.scrollHeight, MAX_INPUT_HEIGHT)
  element.style.height = `${nextHeight}px`
  element.style.overflowY = element.scrollHeight > MAX_INPUT_HEIGHT ? 'auto' : 'hidden'
}

function getProjectNameFromPath(path: string) {
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  return parts[parts.length - 1] || path
}

function getShortPath(path: string) {
  const normalized = path.replace(/\\/g, '/')
  const hasHomePrefix = normalized.startsWith('~')
  const trimmed = normalized.replace(/^~\/?/, '')
  const parts = trimmed.split('/').filter(Boolean)
  const lastTwo = parts.slice(-2).join('/')
  if (hasHomePrefix) return lastTwo ? `~/${lastTwo}` : '~'
  return lastTwo || path
}

export function QuickPanel() {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const selectedProjectRef = useRef<RecentProject | null>(null)
  const composingRef = useRef(false)
  const selectingFolderRef = useRef(false)
  const [value, setValue] = useState('')
  const [projects, setProjects] = useState<RecentProject[]>([])
  const [selectedProject, setSelectedProject] = useState<RecentProject | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)

  selectedProjectRef.current = selectedProject

  const dropdownItemCount = projects.length + 1

  const focusInput = () => {
    window.requestAnimationFrame(() => {
      const element = inputRef.current
      if (!element) return
      element.focus()
      const position = element.value.length
      element.setSelectionRange(position, position)
      resizeTextarea(element)
    })
  }

  const loadProjects = async () => {
    try {
      const items = await window.quickPanel.getRecentProjects()
      setProjects(items)
      setSelectedProject((current) => {
        if (current) {
          return items.find((item) => item.path === current.path) ?? current
        }
        return items[0] ?? null
      })
    } catch {
      setProjects([])
      setSelectedProject((current) => current)
    }
  }

  useEffect(() => {
    const resetPanel = () => {
      setValue('')
      setDropdownOpen(false)
      setFocusedIndex(-1)
      void loadProjects()
      focusInput()
    }

    resetPanel()
    return window.quickPanel.onShow(resetPanel)
  }, [])

  useEffect(() => {
    resizeTextarea(inputRef.current)
  }, [value])

  useEffect(() => {
    const handleWindowBlur = () => {
      window.setTimeout(() => {
        if (selectingFolderRef.current || document.hasFocus()) return
        void window.quickPanel.hide()
      }, 100)
    }

    window.addEventListener('blur', handleWindowBlur)
    return () => window.removeEventListener('blur', handleWindowBlur)
  }, [])

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (dropdownRef.current?.contains(event.target as Node)) return
      setDropdownOpen(false)
      setFocusedIndex(-1)
    }

    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  const handleSubmit = async () => {
    const trimmed = value.trim()
    if (!trimmed) return

    const cwd = selectedProject?.path || projects[0]?.path || '~/Desktop'
    await window.quickPanel.submit(trimmed, cwd)
    setValue('')
    setDropdownOpen(false)
    setFocusedIndex(-1)
  }

  const handlePickFolder = async () => {
    selectingFolderRef.current = true
    try {
      const folder = await window.quickPanel.selectFolder({
        defaultPath: selectedProject?.path || projects[0]?.path || '~/Desktop',
        title: '프로젝트 폴더 선택',
      })
      if (!folder) return

      const project = {
        path: folder,
        name: getProjectNameFromPath(folder),
        lastUsedAt: Date.now(),
      }

      setSelectedProject(project)
      setProjects((current) => [project, ...current.filter((item) => item.path !== folder)])
    } finally {
      selectingFolderRef.current = false
      setDropdownOpen(false)
      setFocusedIndex(-1)
      focusInput()
    }
  }

  const handleSelectProject = (project: RecentProject) => {
    setSelectedProject(project)
    setDropdownOpen(false)
    setFocusedIndex(-1)
    focusInput()
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (dropdownOpen) {
          setDropdownOpen(false)
          setFocusedIndex(-1)
          return
        }
        void window.quickPanel.hide()
        return
      }

      if (!dropdownOpen || dropdownItemCount === 0) return

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setFocusedIndex((current) => (current + 1 + dropdownItemCount) % dropdownItemCount)
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setFocusedIndex((current) => (current - 1 + dropdownItemCount) % dropdownItemCount)
        return
      }

      if (event.key === 'Enter' && focusedIndex >= 0) {
        event.preventDefault()
        if (focusedIndex === projects.length) {
          void handlePickFolder()
          return
        }
        const project = projects[focusedIndex]
        if (project) {
          handleSelectProject(project)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dropdownItemCount, dropdownOpen, focusedIndex, projects])

  return (
    <div className="quick-panel-container">
      <div className="quick-panel-inner">
        <div className="quick-panel-top-row">
          <div ref={dropdownRef} className="quick-panel-project">
            <button
              type="button"
              className={`quick-panel-project-button ${dropdownOpen ? 'open' : ''}`}
              title={selectedProject?.path || '프로젝트 선택'}
              onClick={() => {
                setDropdownOpen((open) => {
                  const next = !open
                  if (next) {
                    const currentIndex = selectedProjectRef.current
                      ? projects.findIndex((item) => item.path === selectedProjectRef.current?.path)
                      : -1
                    setFocusedIndex(currentIndex >= 0 ? currentIndex : projects.length)
                  } else {
                    setFocusedIndex(-1)
                  }
                  return next
                })
              }}
            >
              <svg className="quick-panel-project-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h5.1l1.6 1.9h9.8v8.6a2 2 0 0 1-2 2H5.75a2 2 0 0 1-2-2z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 8.65v-1.9a2 2 0 0 1 2-2h3.2l1.6 1.9h3.2" />
              </svg>

              <span className="quick-panel-project-copy">
                <span className="quick-panel-project-name">{selectedProject?.name ?? '새 대화'}</span>
                <span className="quick-panel-project-path">
                  {selectedProject ? getShortPath(selectedProject.path) : '프로젝트를 선택하거나 바로 입력하세요'}
                </span>
              </span>

              <svg className="quick-panel-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {dropdownOpen && (
              <div className="quick-panel-dropdown">
                {projects.length > 0 && (
                  <div className="quick-panel-dropdown-list">
                    {projects.map((project, index) => (
                      <button
                        key={project.path}
                        type="button"
                        className={`quick-panel-dropdown-item ${focusedIndex === index ? 'active' : ''}`}
                        onMouseEnter={() => setFocusedIndex(index)}
                        onClick={() => handleSelectProject(project)}
                      >
                        <span className="quick-panel-dropdown-name">{project.name}</span>
                        <span className="quick-panel-dropdown-path">{getShortPath(project.path)}</span>
                      </button>
                    ))}
                  </div>
                )}

                {projects.length > 0 && <div className="quick-panel-dropdown-divider" />}

                <button
                  type="button"
                  className={`quick-panel-dropdown-item quick-panel-dropdown-action ${focusedIndex === projects.length ? 'active' : ''}`}
                  onMouseEnter={() => setFocusedIndex(projects.length)}
                  onClick={() => void handlePickFolder()}
                >
                  <span className="quick-panel-dropdown-name">폴더 선택...</span>
                  <span className="quick-panel-dropdown-path">직접 프로젝트 경로를 고릅니다.</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="quick-panel-input-row">
          <div className="quick-panel-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 18.2 3.8 20V6.8A1.8 1.8 0 0 1 5.6 5h12.8a1.8 1.8 0 0 1 1.8 1.8v8.4a1.8 1.8 0 0 1-1.8 1.8H7z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.2 9.2h7.6" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.2 12.8h5.2" />
            </svg>
          </div>

          <textarea
            ref={inputRef}
            value={value}
            rows={1}
            autoFocus
            placeholder="오늘 무엇을 도와드릴까요?"
            className="quick-panel-input"
            onChange={(event) => {
              setValue(event.target.value)
              resizeTextarea(event.target)
            }}
            onCompositionStart={() => {
              composingRef.current = true
            }}
            onCompositionEnd={() => {
              composingRef.current = false
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !composingRef.current) {
                event.preventDefault()
                void handleSubmit()
              }
            }}
          />

          <button
            type="button"
            className="quick-panel-submit"
            onClick={() => void handleSubmit()}
            disabled={value.trim().length === 0}
            aria-label="전송"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h11" />
              <path strokeLinecap="round" strokeLinejoin="round" d="m11 6 6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
