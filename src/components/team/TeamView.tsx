import type { SelectedFile } from '../../../electron/preload'
import { AgentTeamGuideModal } from './AgentTeamGuideModal'
import { TeamSetupModal } from './TeamSetupModal'
import { TeamViewComposer } from './TeamViewComposer'
import { TeamViewEmptyState } from './TeamViewEmptyState'
import { TeamViewHeader } from './TeamViewHeader'
import { TeamViewWorkspace } from './TeamViewWorkspace'
import { useTeamViewController } from './useTeamViewController'

type Props = {
  defaultCwd: string
  startDiscussion: (teamId: string, task: string, files?: SelectedFile[]) => Promise<void>
  continueDiscussion: (teamId: string) => Promise<void>
  abortDiscussion: (teamId: string) => Promise<void>
  onClose: () => void
  embedded?: boolean
  onInjectSummary?: (text: string) => void
  onTeamLinked?: (teamId: string) => void
}

export function TeamView({
  defaultCwd,
  startDiscussion,
  continueDiscussion,
  abortDiscussion,
  onClose,
  embedded,
  onInjectSummary,
  onTeamLinked,
}: Props) {
  const controller = useTeamViewController({
    defaultCwd,
    startDiscussion,
    continueDiscussion,
    abortDiscussion,
    onInjectSummary,
    onTeamLinked,
  })

  if (controller.projectTeams.length === 0) {
    return (
      <>
        <TeamViewEmptyState onCreateTeam={controller.openSetup} />
        {controller.showSetup && (
          <TeamSetupModal
            onConfirm={controller.handleCreateTeam}
            onClose={controller.closeSetup}
          />
        )}
      </>
    )
  }

  return (
    <>
      <div className="flex h-full flex-col bg-claude-bg">
        <TeamViewHeader
          embedded={embedded}
          onClose={onClose}
          onOpenGuide={controller.openGuide}
          onOpenSetup={controller.openSetup}
          onSelectTeam={controller.handleSelectTeam}
          projectTeams={controller.projectTeams}
          resolvedActiveTeamId={controller.resolvedActiveTeamId}
        />

        {controller.displayActiveTeam && controller.activeTeam && (
          <>
            <TeamViewWorkspace
              activeAgentId={controller.activeAgentId}
              activeTeam={controller.displayActiveTeam}
              carpetInsets={controller.carpetInsets}
              detailPanelStyle={controller.detailPanelStyle}
              focusedAgent={controller.focusedAgent}
              onChangeMode={controller.handleChangeMode}
              onCloseTaskPopover={() => controller.setIsTaskPopoverOpen(false)}
              onOpenTaskPopover={() => controller.setIsTaskPopoverOpen(true)}
              onRemoveTeam={controller.handleRemoveActiveTeam}
              onReset={controller.handleReset}
              onResizeStart={controller.handleDetailPanelResizeStart}
              onSelectAgent={controller.setFocusedAgentId}
              taskSummary={controller.taskSummary}
              taskPopoverOpen={controller.isTaskPopoverOpen}
            />

            <TeamViewComposer
              activeTeam={controller.activeTeam}
              attachedFiles={controller.attachedFiles}
              canSubmitTask={controller.canSubmitTask}
              injected={controller.injected}
              isAttaching={controller.isAttaching}
              isComposingRef={controller.isComposingRef}
              isDragOver={controller.isDragOver}
              onAbort={controller.handleAbort}
              onAttachFiles={() => {
                void controller.handleAttachFiles()
              }}
              onContinue={() => {
                void controller.handleContinue()
              }}
              onDragEnter={controller.handleDragEnter}
              onDragLeave={controller.handleDragLeave}
              onDragOver={controller.handleDragOver}
              onDrop={(event) => {
                void controller.handleDrop(event)
              }}
              onInjectSummary={onInjectSummary ? controller.handleInjectSummary : undefined}
              onPaste={(event) => {
                void controller.handlePaste(event)
              }}
              onRemoveFile={(path) => {
                controller.setAttachedFiles((current) => current.filter((file) => file.path !== path))
              }}
              onStart={() => {
                void controller.handleStart()
              }}
              onTaskChange={controller.setTask}
              onTaskKeyDown={controller.handleTaskKeyDown}
              skippedFiles={controller.skippedFiles}
              task={controller.task}
              textareaRef={controller.textareaRef}
            />
          </>
        )}
      </div>

      {controller.showSetup && (
        <TeamSetupModal
          onConfirm={controller.handleCreateTeam}
          onClose={controller.closeSetup}
        />
      )}

      {controller.showGuide && <AgentTeamGuideModal onClose={controller.closeGuide} />}
    </>
  )
}
