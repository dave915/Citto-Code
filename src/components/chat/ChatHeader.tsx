import type { MouseEvent as ReactMouseEvent, MutableRefObject } from 'react'
import type { GitBranchInfo, GitRepoStatus, OpenWithApp } from '../../../electron/preload'
import { useI18n } from '../../hooks/useI18n'
import { BranchMenu } from './header/BranchMenu'
import { OpenWithMenu } from './header/OpenWithMenu'
import { PanelStackMenu } from './header/PanelStackMenu'
import type { ChatViewRightPanel } from '../../hooks/useChatViewLayout'

export function ChatHeader({
  isNewSession,
  sidebarCollapsed,
  onToggleSidebar,
  sidebarShortcutLabel,
  sessionCwd,
  gitStatus,
  branchMenuRef,
  branchSearchInputRef,
  branchMenuOpen,
  branchQuery,
  filteredGitBranches,
  gitBranchesLoading,
  gitActionLoading,
  gitLoading,
  onToggleBranchMenu,
  onBranchQueryChange,
  onSelectBranch,
  onDeleteBranch,
  onOpenBranchCreateModal,
  onInitGitRepo,
  onPullGit,
  onPushGit,
  showHeaderOpenWithAction,
  openWithMenuRef,
  openWithMenuOpen,
  openWithLoading,
  openWithApps,
  defaultOpenWithApp,
  preferredOpenWithAppId,
  onDefaultOpen,
  onToggleOpenWithMenu,
  onOpenWith,
  gitAvailable,
  gitPanelOpen,
  filePanelOpen,
  previewPanelOpen,
  sessionPanelOpen,
  filesShortcutLabel,
  sessionInfoShortcutLabel,
  previewAvailable,
  onTogglePanel,
  onHeaderDoubleClick,
}: {
  isNewSession: boolean
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  sidebarShortcutLabel: string
  sessionCwd: string
  gitStatus: GitRepoStatus | null
  branchMenuRef: MutableRefObject<HTMLDivElement | null>
  branchSearchInputRef: MutableRefObject<HTMLInputElement | null>
  branchMenuOpen: boolean
  branchQuery: string
  filteredGitBranches: GitBranchInfo[]
  gitBranchesLoading: boolean
  gitActionLoading: boolean
  gitLoading: boolean
  onToggleBranchMenu: () => void
  onBranchQueryChange: (value: string) => void
  onSelectBranch: (name: string) => void | Promise<void>
  onDeleteBranch: (name: string) => void | Promise<void>
  onOpenBranchCreateModal: () => void
  onInitGitRepo: () => void | Promise<void>
  onPullGit: () => void | Promise<void>
  onPushGit: () => void | Promise<void>
  showHeaderOpenWithAction: boolean
  openWithMenuRef: MutableRefObject<HTMLDivElement | null>
  openWithMenuOpen: boolean
  openWithLoading: boolean
  openWithApps: OpenWithApp[]
  defaultOpenWithApp: OpenWithApp | null
  preferredOpenWithAppId: string
  onDefaultOpen: () => void | Promise<void>
  onToggleOpenWithMenu: () => void
  onOpenWith: (appId: string) => void | Promise<void>
  gitAvailable: boolean
  gitPanelOpen: boolean
  filePanelOpen: boolean
  previewPanelOpen: boolean
  sessionPanelOpen: boolean
  filesShortcutLabel: string
  sessionInfoShortcutLabel: string
  previewAvailable: boolean
  onTogglePanel: (panel: ChatViewRightPanel) => void
  onHeaderDoubleClick: (event: ReactMouseEvent<HTMLDivElement>) => void
}) {
  const { t } = useI18n()
  const panelItems = [
    {
      id: 'preview' as const,
      label: t('common.preview'),
      active: previewPanelOpen,
      disabled: !previewAvailable && !previewPanelOpen,
      icon: (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 15l2.4-2.6a1.5 1.5 0 0 1 2.2 0L15 15" />
          <circle cx="15.5" cy="9.5" r="1.5" />
        </svg>
      ),
    },
    {
      id: 'git' as const,
      label: t('sidePanel.diff'),
      active: gitPanelOpen,
      disabled: !gitAvailable && !gitPanelOpen,
      icon: (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="4.5" y="4.5" width="15" height="15" rx="3.5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 9h8" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 15h8" />
        </svg>
      ),
    },
    {
      id: 'files' as const,
      label: t('sidePanel.fileExplorer'),
      active: filePanelOpen,
      shortcutLabel: filesShortcutLabel,
      icon: (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 12h16" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 18h10" />
        </svg>
      ),
    },
    {
      id: 'session' as const,
      label: t('sidePanel.sessionInfo'),
      active: sessionPanelOpen,
      shortcutLabel: sessionInfoShortcutLabel,
      icon: (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 7h.01" />
        </svg>
      ),
    },
  ]

  return (
    <div
      className="draggable-region relative z-30 flex h-12 flex-shrink-0 items-center justify-between border-b border-claude-border bg-claude-panel pr-4"
      style={{ paddingLeft: !isNewSession && sidebarCollapsed ? '76px' : '16px' }}
      onDoubleClick={onHeaderDoubleClick}
    >
      <div
        className="flex min-w-0 flex-1 items-center gap-2 overflow-visible px-2 py-1.5 text-xs text-claude-muted"
        title={t('header.currentWorktree')}
      >
        {!isNewSession && (
          <button
            onClick={onToggleSidebar}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-claude-muted transition-colors hover:bg-claude-surface hover:text-claude-text"
            title={`${sidebarCollapsed ? t('header.openSidebar') : t('header.closeSidebar')} (${sidebarShortcutLabel})`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5v14" />
            </svg>
          </button>
        )}
        <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <span className="min-w-0 max-w-sm truncate font-mono text-[12px] text-claude-muted">
          {sessionCwd || '~'}
        </span>

        <BranchMenu
          gitStatus={gitStatus}
          branchMenuRef={branchMenuRef}
          branchSearchInputRef={branchSearchInputRef}
          branchMenuOpen={branchMenuOpen}
          branchQuery={branchQuery}
          filteredGitBranches={filteredGitBranches}
          gitBranchesLoading={gitBranchesLoading}
          gitActionLoading={gitActionLoading}
          gitLoading={gitLoading}
          onToggleBranchMenu={onToggleBranchMenu}
          onBranchQueryChange={onBranchQueryChange}
          onSelectBranch={onSelectBranch}
          onDeleteBranch={onDeleteBranch}
          onOpenBranchCreateModal={onOpenBranchCreateModal}
          onInitGitRepo={onInitGitRepo}
          onPullGit={onPullGit}
          onPushGit={onPushGit}
        />
      </div>

      <div className="no-drag flex flex-shrink-0 items-center gap-2" data-no-drag="true">
        {showHeaderOpenWithAction && (
          <OpenWithMenu
            openWithMenuRef={openWithMenuRef}
            openWithMenuOpen={openWithMenuOpen}
            openWithLoading={openWithLoading}
            openWithApps={openWithApps}
            defaultOpenWithApp={defaultOpenWithApp}
            preferredOpenWithAppId={preferredOpenWithAppId}
            onDefaultOpen={onDefaultOpen}
            onToggleOpenWithMenu={onToggleOpenWithMenu}
            onOpenWith={onOpenWith}
          />
        )}

        <PanelStackMenu
          items={panelItems}
          title={t('header.panelMenu')}
          onToggle={onTogglePanel}
        />
      </div>
    </div>
  )
}
