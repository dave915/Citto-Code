import { useGitPanelActions } from './git/useGitPanelActions'
import { useGitPanelControls } from './git/useGitPanelControls'
import { useGitPanelData } from './git/useGitPanelData'

export function useGitPanel({
  cwd,
  gitPanelOpen,
}: {
  cwd: string
  gitPanelOpen: boolean
}) {
  const data = useGitPanelData({ cwd, gitPanelOpen })
  const controls = useGitPanelControls({
    cwd,
    gitBranches: data.gitBranches,
    gitPanelOpen,
    refreshGitBranches: data.refreshGitBranches,
    refreshGitPanelPassive: data.refreshGitPanelPassive,
    refreshGitStatus: data.refreshGitStatus,
    stagedGitEntryCount: data.stagedGitEntryCount,
  })
  const actions = useGitPanelActions({
    cwd,
    gitCommitMessage: controls.gitCommitMessage,
    gitNewBranchName: controls.gitNewBranchName,
    gitStatus: data.gitStatus,
    refreshGitPanel: data.refreshGitPanel,
    setBranchCreateModalOpen: controls.setBranchCreateModalOpen,
    setBranchMenuOpen: controls.setBranchMenuOpen,
    setBranchQuery: controls.setBranchQuery,
    setGitCommitMessage: controls.setGitCommitMessage,
    setGitNewBranchName: controls.setGitNewBranchName,
  })

  return {
    ...controls,
    ...data,
    ...actions,
  }
}
