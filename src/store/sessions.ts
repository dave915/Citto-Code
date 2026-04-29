import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { CURRENT_THEME_ID } from '../lib/theme'
import { DEFAULT_APP_LANGUAGE } from '../lib/i18n'
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
import type { SessionsStore, ShortcutBinding, ShortcutConfig } from './sessionTypes'

export const useSessionsStore = create<SessionsStore>()(
  persist(
    (set) => createSessionStoreState(set),
    {
      name: 'citto-code-sessions',
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      version: 8,
      migrate: (persistedState, _version) => {
        const state = persistedState as Partial<SessionsStore> & {
          quickPanelEnabled?: boolean
          shortcutConfig?: Partial<ShortcutConfig> & {
            toggleQuickPanel?: ShortcutBinding
          }
        }
        const defaultProjectPath = state.defaultProjectPath?.trim() || DEFAULT_PROJECT_PATH
        const activeSessionId =
          typeof state.activeSessionId === 'string' || state.activeSessionId === null
            ? state.activeSessionId
            : null

        const shortcutConfig = {
          ...DEFAULT_SHORTCUT_CONFIG,
          ...(state.shortcutConfig ?? {}),
          toggleSecretary:
            state.shortcutConfig?.toggleSecretary
            ?? state.shortcutConfig?.toggleQuickPanel
            ?? DEFAULT_SHORTCUT_CONFIG.toggleSecretary,
        }

        return {
          ...state,
          defaultProjectPath,
          sessions: undefined,
          activeSessionId,
          appLanguage: state.appLanguage ?? DEFAULT_APP_LANGUAGE,
          autoHtmlPreview: state.autoHtmlPreview ?? true,
          uiFontSize: clampUiFontSize(state.uiFontSize ?? DEFAULT_UI_FONT_SIZE),
          uiZoomPercent: clampUiZoomPercent(state.uiZoomPercent ?? DEFAULT_UI_ZOOM_PERCENT),
          secretaryEnabled: state.secretaryEnabled ?? state.quickPanelEnabled ?? true,
          shortcutConfig,
        }
      },
      partialize: (state) => ({
        activeSessionId: state.activeSessionId,
        defaultProjectPath: state.defaultProjectPath,
        appLanguage: state.appLanguage,
        envVars: state.envVars,
        autoHtmlPreview: state.autoHtmlPreview,
        sidebarMode: state.sidebarMode,
        claudeBinaryPath: state.claudeBinaryPath,
        preferredOpenWithAppId: state.preferredOpenWithAppId,
        themeId: state.themeId,
        notificationMode: state.notificationMode,
        uiFontSize: state.uiFontSize,
        uiZoomPercent: state.uiZoomPercent,
        secretaryEnabled: state.secretaryEnabled,
        shortcutConfig: state.shortcutConfig,
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<SessionsStore> & {
          notificationsEnabled?: boolean
          quickPanelEnabled?: boolean
          shortcutConfig?: Partial<ShortcutConfig> & {
            toggleQuickPanel?: ShortcutBinding
          }
        }
        const activeSessionId =
          typeof persistedState.activeSessionId === 'string' || persistedState.activeSessionId === null
            ? persistedState.activeSessionId
            : current.activeSessionId

        const shortcutConfig = {
          ...DEFAULT_SHORTCUT_CONFIG,
          ...(persistedState.shortcutConfig ?? {}),
          toggleSecretary:
            persistedState.shortcutConfig?.toggleSecretary
            ?? persistedState.shortcutConfig?.toggleQuickPanel
            ?? DEFAULT_SHORTCUT_CONFIG.toggleSecretary,
        }

        return {
          ...current,
          ...persistedState,
          appLanguage: persistedState.appLanguage ?? DEFAULT_APP_LANGUAGE,
          defaultProjectPath: persistedState.defaultProjectPath ?? DEFAULT_PROJECT_PATH,
          autoHtmlPreview: persistedState.autoHtmlPreview ?? true,
          claudeBinaryPath: persistedState.claudeBinaryPath ?? '',
          preferredOpenWithAppId: persistedState.preferredOpenWithAppId ?? '',
          themeId: persistedState.themeId ?? CURRENT_THEME_ID,
          notificationMode:
            persistedState.notificationMode
            ?? (persistedState.notificationsEnabled === false ? 'off' : 'all'),
          uiFontSize: clampUiFontSize(persistedState.uiFontSize ?? DEFAULT_UI_FONT_SIZE),
          uiZoomPercent: clampUiZoomPercent(persistedState.uiZoomPercent ?? DEFAULT_UI_ZOOM_PERCENT),
          secretaryEnabled: persistedState.secretaryEnabled ?? persistedState.quickPanelEnabled ?? true,
          shortcutConfig,
          activeSessionId,
          sessions: current.sessions,
        }
      },
    },
  ),
)

export type {
  AttachedFile,
  BtwCard,
  ImportedMessage,
  ImportedSessionData,
  ImportedToolCall,
  Message,
  ModelSwitchNotice,
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
  SubagentState,
  ToolCallBlock,
  ToolCallStatus,
} from './sessionTypes'
export type { AppLanguage } from '../lib/i18n'

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
