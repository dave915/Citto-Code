import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { CURRENT_THEME_ID } from '../lib/theme'
import {
  DEFAULT_PROJECT_PATH,
  DEFAULT_SHORTCUT_CONFIG,
  DEFAULT_UI_FONT_SIZE,
  DEFAULT_UI_ZOOM_PERCENT,
  MAX_UI_FONT_SIZE,
  MAX_UI_ZOOM_PERCENT,
  MIN_UI_FONT_SIZE,
  MIN_UI_ZOOM_PERCENT,
  clampUiFontSize,
  clampUiZoomPercent,
  findTabByClaudeSessionId,
  getProjectNameFromPath,
  searchSessionMessages,
  searchSessions,
} from '../lib/sessionUtils'
import { createSessionStoreState } from './sessionStoreState'
import type { SessionsStore, ShortcutConfig } from './sessionTypes'

export const useSessionsStore = create<SessionsStore>()(
  persist(
    (set) => createSessionStoreState(set),
    {
      name: 'claude-ui-sessions',
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      version: 5,
      migrate: (persistedState, _version) => {
        const state = persistedState as Partial<SessionsStore> & {
          shortcutConfig?: Partial<ShortcutConfig>
        }
        const defaultProjectPath = state.defaultProjectPath?.trim() || DEFAULT_PROJECT_PATH
        const activeSessionId =
          typeof state.activeSessionId === 'string' || state.activeSessionId === null
            ? state.activeSessionId
            : null

        return {
          ...state,
          defaultProjectPath,
          sessions: undefined,
          activeSessionId,
          uiFontSize: clampUiFontSize(state.uiFontSize ?? DEFAULT_UI_FONT_SIZE),
          uiZoomPercent: clampUiZoomPercent(state.uiZoomPercent ?? DEFAULT_UI_ZOOM_PERCENT),
          quickPanelEnabled: state.quickPanelEnabled ?? true,
          shortcutConfig: {
            ...DEFAULT_SHORTCUT_CONFIG,
            ...(state.shortcutConfig ?? {}),
          },
        }
      },
      partialize: (state) => ({
        activeSessionId: state.activeSessionId,
        defaultProjectPath: state.defaultProjectPath,
        envVars: state.envVars,
        sidebarMode: state.sidebarMode,
        claudeBinaryPath: state.claudeBinaryPath,
        preferredOpenWithAppId: state.preferredOpenWithAppId,
        themeId: state.themeId,
        notificationMode: state.notificationMode,
        uiFontSize: state.uiFontSize,
        uiZoomPercent: state.uiZoomPercent,
        quickPanelEnabled: state.quickPanelEnabled,
        shortcutConfig: state.shortcutConfig,
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<SessionsStore> & {
          notificationsEnabled?: boolean
        }
        const activeSessionId =
          typeof persistedState.activeSessionId === 'string' || persistedState.activeSessionId === null
            ? persistedState.activeSessionId
            : current.activeSessionId

        return {
          ...current,
          ...persistedState,
          defaultProjectPath: persistedState.defaultProjectPath ?? DEFAULT_PROJECT_PATH,
          claudeBinaryPath: persistedState.claudeBinaryPath ?? '',
          preferredOpenWithAppId: persistedState.preferredOpenWithAppId ?? '',
          themeId: persistedState.themeId ?? CURRENT_THEME_ID,
          notificationMode:
            persistedState.notificationMode
            ?? (persistedState.notificationsEnabled === false ? 'off' : 'all'),
          uiFontSize: clampUiFontSize(persistedState.uiFontSize ?? DEFAULT_UI_FONT_SIZE),
          uiZoomPercent: clampUiZoomPercent(persistedState.uiZoomPercent ?? DEFAULT_UI_ZOOM_PERCENT),
          quickPanelEnabled: persistedState.quickPanelEnabled ?? true,
          shortcutConfig: {
            ...DEFAULT_SHORTCUT_CONFIG,
            ...(persistedState.shortcutConfig ?? {}),
          },
          activeSessionId,
          sessions: current.sessions,
        }
      },
    },
  ),
)

export type {
  AttachedFile,
  ImportedMessage,
  ImportedSessionData,
  ImportedToolCall,
  Message,
  NotificationMode,
  PendingPermissionRequest,
  PendingQuestionOption,
  PendingQuestionRequest,
  PermissionMode,
  Session,
  SessionsStore,
  ShortcutAction,
  ShortcutBinding,
  ShortcutConfig,
  ShortcutPlatform,
  SidebarMode,
  ToolCallBlock,
  ToolCallStatus,
} from './sessionTypes'

export {
  DEFAULT_PROJECT_PATH,
  DEFAULT_SHORTCUT_CONFIG,
  DEFAULT_UI_FONT_SIZE,
  DEFAULT_UI_ZOOM_PERCENT,
  MAX_UI_FONT_SIZE,
  MAX_UI_ZOOM_PERCENT,
  MIN_UI_FONT_SIZE,
  MIN_UI_ZOOM_PERCENT,
  clampUiFontSize,
  clampUiZoomPercent,
  findTabByClaudeSessionId,
  getProjectNameFromPath,
  searchSessionMessages,
  searchSessions,
} from '../lib/sessionUtils'

export type { SessionMessageSearchResult } from '../lib/sessionUtils'
