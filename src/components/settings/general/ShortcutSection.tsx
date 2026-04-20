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
import { appFieldClassName, cx } from '../../ui/appDesignSystem'
import { SettingsSection } from '../shared'

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
    <SettingsSection
      title={t('settings.general.shortcuts.title')}
      description={t('settings.general.shortcuts.description', { platform: platformLabel })}
    >
      <div className="overflow-x-auto rounded-lg border border-claude-border bg-claude-bg/70">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-claude-muted">{t('settings.general.shortcuts.actionHeader')}</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-claude-muted">{platformLabel}</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(SHORTCUT_ACTION_LABELS[language]) as ShortcutAction[]).map((action) => (
              <tr key={action} className={cx('border-t border-claude-border/60', recordingAction === action && 'bg-claude-panel/70')}>
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
                      className={cx(
                        appFieldClassName,
                        'pr-20 font-mono text-sm',
                        recordingAction === action && 'border-claude-orange/35 bg-claude-panel ring-claude-orange/15',
                      )}
                      placeholder={currentPlatform === 'mac' ? 'Cmd+K' : 'Ctrl+K'}
                      spellCheck={false}
                    />
                    <span
                      className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-[11px] font-medium ${
                        recordingAction === action
                          ? 'bg-claude-bg text-claude-text'
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
    </SettingsSection>
  )
}
