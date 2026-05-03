import { ipcRenderer } from 'electron'
import type {
  SecretaryAPI,
  SecretaryActiveContext,
  SecretaryActionResult,
  SecretaryBotState,
  SecretaryFloatingPlacement,
  SecretaryNavigateEvent,
  SecretaryRendererActionRequest,
} from './types'

function isRendererActionRequest(value: unknown): value is SecretaryRendererActionRequest {
  return (
    typeof value === 'object'
    && value !== null
    && typeof (value as { requestId?: unknown }).requestId === 'string'
    && typeof (value as { action?: unknown }).action === 'object'
    && (value as { action?: unknown }).action !== null
  )
}

export const secretaryAPI: SecretaryAPI = {
  togglePanel: () => ipcRenderer.invoke('secretary:toggle-panel'),
  getPanelOpen: () => ipcRenderer.invoke('secretary:get-panel-open'),
  setPanelOpen: (open) => ipcRenderer.invoke('secretary:set-panel-open', { open }),
  setFloatingExpanded: (expanded) => ipcRenderer.invoke('secretary:set-floating-expanded', { expanded }),
  moveFloatingBy: (deltaX, deltaY) => ipcRenderer.send('secretary:move-floating-by', { deltaX, deltaY }),
  openMainWindow: () => ipcRenderer.invoke('secretary:open-main-window'),
  onPanelToggle: (handler) => {
    const listener = (_: Electron.IpcRendererEvent, open: boolean) => handler(Boolean(open))
    ipcRenderer.on('secretary:panel-toggle', listener)
    return () => ipcRenderer.removeListener('secretary:panel-toggle', listener)
  },
  onFloatingPlacement: (handler) => {
    const listener = (_: Electron.IpcRendererEvent, placement: SecretaryFloatingPlacement) => handler({
      horizontal: placement?.horizontal === 'right' ? 'right' : 'left',
      vertical: placement?.vertical === 'bottom' ? 'bottom' : 'top',
    })
    ipcRenderer.on('secretary:floating-placement', listener)
    return () => ipcRenderer.removeListener('secretary:floating-placement', listener)
  },
  process: (input, runtime) => ipcRenderer.invoke('secretary:process', { input, runtime }),
  onBotState: (handler) => {
    const listener = (_: Electron.IpcRendererEvent, state: SecretaryBotState) => handler(state)
    ipcRenderer.on('secretary:bot-state', listener)
    return () => ipcRenderer.removeListener('secretary:bot-state', listener)
  },
  getActiveContext: () => ipcRenderer.invoke('secretary:active-context'),
  updateActiveContext: (context: SecretaryActiveContext) => ipcRenderer.invoke('secretary:update-active-context', context),
  executeAction: (action) => ipcRenderer.invoke('secretary:execute-action', action),
  onNavigate: (handler) => {
    const listener = (_: Electron.IpcRendererEvent, event: SecretaryNavigateEvent) => handler(event)
    ipcRenderer.on('citto:navigate', listener)
    return () => ipcRenderer.removeListener('citto:navigate', listener)
  },
  onActionResult: (handler) => {
    const listener = (_: Electron.IpcRendererEvent, result: SecretaryActionResult) => handler(result)
    ipcRenderer.on('secretary:action-result', listener)
    return () => ipcRenderer.removeListener('secretary:action-result', listener)
  },
  onRendererAction: (handler) => {
    const listener = (_: Electron.IpcRendererEvent, request: unknown) => {
      if (isRendererActionRequest(request)) {
        handler(request)
      }
    }
    ipcRenderer.on('secretary:renderer-action', listener)
    return () => ipcRenderer.removeListener('secretary:renderer-action', listener)
  },
  reportRendererActionResult: (requestId, result) => ipcRenderer.invoke('secretary:renderer-action-result', { requestId, result }),
  listConversations: () => ipcRenderer.invoke('secretary:list-conversations'),
  getActiveConversation: () => ipcRenderer.invoke('secretary:get-active-conversation'),
  createConversation: () => ipcRenderer.invoke('secretary:create-conversation'),
  switchConversation: (id) => ipcRenderer.invoke('secretary:switch-conversation', id),
  renameConversation: (id, title) => ipcRenderer.invoke('secretary:rename-conversation', { id, title }),
  archiveConversation: (id) => ipcRenderer.invoke('secretary:archive-conversation', id),
  getHistory: (conversationId, limit) => ipcRenderer.invoke('secretary:get-history', { conversationId, limit }),
  getProfile: () => ipcRenderer.invoke('secretary:get-profile'),
  updateProfile: (key, value) => ipcRenderer.invoke('secretary:update-profile', { key, value }),
}
