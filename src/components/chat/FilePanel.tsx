import type { PointerEvent as ReactPointerEvent } from 'react'
import { useI18n } from '../../hooks/useI18n'

import type { DirEntry } from '../../../electron/preload'
import { ExplorerNode } from './FileExplorerTree'
import { PreviewPane } from './PreviewPane'

export function FilePanel({
  showPreviewPane,
  selectedEntry,
  previewContent,
  previewState,
  markdownPreviewEnabled,
  onToggleMarkdownPreview,
  onExplorerResizeStart,
  explorerWidth,
  loadingPaths,
  rootEntries,
  expandedDirs,
  childEntries,
  selectedPath,
  onToggleDirectory,
  onSelectEntry,
}: {
  showPreviewPane: boolean
  selectedEntry: DirEntry | null
  previewContent: string
  previewState: 'idle' | 'loading' | 'ready' | 'unsupported'
  markdownPreviewEnabled: boolean
  onToggleMarkdownPreview: () => void
  onExplorerResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void
  explorerWidth: number
  loadingPaths: Record<string, boolean>
  rootEntries: DirEntry[]
  expandedDirs: Record<string, boolean>
  childEntries: Record<string, DirEntry[]>
  selectedPath: string | null
  onToggleDirectory: (entry: DirEntry) => void | Promise<void>
  onSelectEntry: (entry: DirEntry) => void | Promise<void>
}) {
  const { t } = useI18n()
  return (
    <div className="flex flex-1 min-h-0">
      {showPreviewPane && (
        <>
          <div className="min-w-0 flex-1 overflow-y-auto bg-claude-bg">
            <PreviewPane
              entry={selectedEntry}
              previewContent={previewContent}
              previewState={previewState}
              markdownPreviewEnabled={markdownPreviewEnabled}
              onToggleMarkdownPreview={onToggleMarkdownPreview}
            />
          </div>

          <div
            onPointerDown={onExplorerResizeStart}
            className="w-1.5 cursor-col-resize bg-transparent hover:bg-claude-border/80 transition-colors flex-shrink-0"
          />
        </>
      )}

      <div
        className={`min-w-0 overflow-y-auto px-2 py-3 ${showPreviewPane ? 'border-l border-claude-border bg-claude-panel/65' : 'flex-1 bg-claude-panel/65'}`}
        style={showPreviewPane ? { width: `${explorerWidth}px` } : undefined}
      >
        {loadingPaths.__root__ ? (
          <div className="flex items-center justify-center py-12 text-claude-muted">
            <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
            </svg>
          </div>
        ) : rootEntries.length === 0 ? (
          <div className="py-12 text-center text-claude-muted">
            <p className="text-sm">{t('filePanel.none')}</p>
          </div>
        ) : (
          <div className="pl-2">
            {rootEntries.map((entry) => (
              <ExplorerNode
                key={entry.path}
                entry={entry}
                depth={0}
                expandedDirs={expandedDirs}
                childEntries={childEntries}
                loadingPaths={loadingPaths}
                selectedPath={selectedPath}
                onToggleDirectory={onToggleDirectory}
                onSelectEntry={onSelectEntry}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
