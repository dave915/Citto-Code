import { useState } from 'react'
import {
  SHORTCUT_ACTION_LABELS,
  getCurrentPlatform,
  shortcutFromKeyboardEvent,
} from '../../../lib/shortcuts'
import { useI18n } from '../../../hooks/useI18n'
import type {
  ShortcutAction,
  ShortcutConfig,
  ShortcutPlatform,
} from '../../../store/sessions'

type Props = {
  shortcutConfig: ShortcutConfig
  onShortcutChange: (action: ShortcutAction, platform: ShortcutPlatform, value: string) => void
}

export function ShortcutSection({ shortcutConfig, onShortcutChange }: Props) {
  const { language, t } = useI18n()
  const currentPlatform = getCurrentPlatform()
  const platformLabel = currentPlatform === 'mac' ? 'macOS' : 'Windows'
  const [recordingAction, setRecordingAction] = useState<ShortcutAction | null>(null)

  return (
    <div className="rounded-2xl border border-claude-border bg-claude-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-claude-text">{t('settings.general.shortcuts.title')}</p>
          <p className="mt-1 text-xs leading-relaxed text-claude-muted">
            {t('settings.general.shortcuts.description', { platform: platformLabel })}
          </p>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-claude-muted">{t('settings.general.shortcuts.actionHeader')}</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-claude-muted">{platformLabel}</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(SHORTCUT_ACTION_LABELS[language]) as ShortcutAction[]).map((action) => (
              <tr key={action} className={recordingAction === action ? 'bg-[#34363c]' : ''}>
                <td className="px-3 py-2 text-sm text-claude-text">{SHORTCUT_ACTION_LABELS[language][action]}</td>
                <td className="px-3 py-2">
                  <div className="relative">
                    <input
                      value={shortcutConfig[action][currentPlatform]}
                      readOnly
                      onFocus={() => setRecordingAction(action)}
                      onBlur={() => setRecordingAction((current) => (current === action ? null : current))}
                      onKeyDown={(event) => {
                        event.preventDefault()
                        if (event.key === 'Backspace' || event.key === 'Delete') {
                          onShortcutChange(action, currentPlatform, '')
                          return
                        }
                        const next = shortcutFromKeyboardEvent(event.nativeEvent, currentPlatform)
                        if (next) onShortcutChange(action, currentPlatform, next)
                      }}
                      className={`w-full rounded-lg border px-3 py-2 pr-20 text-sm font-mono focus:outline-none focus:ring-1 ${
                        recordingAction === action
                          ? 'border-[#6a6d75] bg-[#2f3137] text-white ring-white/15'
                          : 'border-claude-border bg-claude-panel text-claude-text focus:border-claude-border focus:ring-white/10'
                      }`}
                      placeholder={currentPlatform === 'mac' ? 'Cmd+K' : 'Ctrl+K'}
                      spellCheck={false}
                    />
                    <span
                      className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-[11px] font-medium ${
                        recordingAction === action
                          ? 'bg-[#44474f] text-white'
                          : 'bg-claude-panel text-claude-muted'
                      }`}
                    >
                      {recordingAction === action ? t('settings.general.shortcuts.recording') : t('settings.general.shortcuts.clickToRecord')}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
