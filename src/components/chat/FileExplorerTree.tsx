import type { DirEntry } from '../../../electron/preload'

type ExplorerNodeProps = {
  entry: DirEntry
  depth: number
  expandedDirs: Record<string, boolean>
  childEntries: Record<string, DirEntry[]>
  loadingPaths: Record<string, boolean>
  selectedPath: string | null
  onToggleDirectory: (entry: DirEntry) => void
  onSelectEntry: (entry: DirEntry) => void
}

export function ExplorerNode({
  entry,
  depth,
  expandedDirs,
  childEntries,
  loadingPaths,
  selectedPath,
  onToggleDirectory,
  onSelectEntry,
}: ExplorerNodeProps) {
  const isDirectory = entry.type === 'directory'
  const isExpanded = expandedDirs[entry.path]
  const children = childEntries[entry.path] ?? []
  const isLoading = loadingPaths[entry.path]
  const isSelected = selectedPath === entry.path

  return (
    <div>
      <button
        onClick={() => {
          if (isDirectory) {
            void onToggleDirectory(entry)
          } else {
            void onSelectEntry(entry)
          }
        }}
        className={`w-full flex items-center gap-2 rounded-md px-2 py-2 text-left transition-colors ${
          isSelected
            ? 'bg-claude-surface-2 text-claude-text ring-1 ring-white/10'
            : 'hover:bg-claude-surface'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        title={entry.path}
      >
        {isDirectory ? (
          <>
            <svg
              className={`w-3.5 h-3.5 flex-shrink-0 text-claude-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
            </svg>
            <svg className="w-4 h-4 flex-shrink-0 text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </>
        ) : (
          <>
            <span className="w-3.5 h-3.5 flex-shrink-0" />
            <FileGlyph name={entry.name} />
          </>
        )}
        <span className={`truncate text-[15px] ${isSelected ? 'font-medium text-claude-text' : 'text-claude-text'}`}>
          {entry.name}
        </span>
      </button>

      {isDirectory && isExpanded && (
        <div>
          {isLoading ? (
            <div className="px-2 py-2 text-xs text-claude-muted" style={{ paddingLeft: `${depth * 16 + 32}px` }}>
              불러오는 중...
            </div>
          ) : (
            children.map((child) => (
              <ExplorerNode
                key={child.path}
                entry={child}
                depth={depth + 1}
                expandedDirs={expandedDirs}
                childEntries={childEntries}
                loadingPaths={loadingPaths}
                selectedPath={selectedPath}
                onToggleDirectory={onToggleDirectory}
                onSelectEntry={onSelectEntry}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

function FileGlyph({ name }: { name: string }) {
  const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() ?? '' : ''

  if (ext === 'html') {
    return (
      <svg className="w-4 h-4 flex-shrink-0 text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 3h16l-1.5 18L12 19l-6.5 2L4 3z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 8l-2 2 2 2m6-4l2 2-2 2" />
      </svg>
    )
  }

  if (ext === 'json' || ext === 'md') {
    return (
      <svg className="w-4 h-4 flex-shrink-0 text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9zm0 0v6h6" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6M9 17h4" />
      </svg>
    )
  }

  if (ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx') {
    return (
      <svg className="w-4 h-4 flex-shrink-0 text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9zm0 0v6h6" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 15h3m2 0h3M10 12v6" />
      </svg>
    )
  }

  return (
    <svg className="w-4 h-4 flex-shrink-0 text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9zm0 0v6h6" />
    </svg>
  )
}
