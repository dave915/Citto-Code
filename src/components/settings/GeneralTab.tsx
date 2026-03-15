import type { SidebarMode } from '../../store/sessions'
import { useSessionsStore } from '../../store/sessions'
import { ClaudeBinaryPathSection } from './general/ClaudeBinaryPathSection'
import { CliImportSection } from './general/CliImportSection'
import { DefaultProjectSection } from './general/DefaultProjectSection'
import { DisplaySection } from './general/DisplaySection'
import { NotificationSection } from './general/NotificationSection'
import { QuickPanelSection } from './general/QuickPanelSection'
import { ShortcutSection } from './general/ShortcutSection'
import { SidebarModeSection } from './general/SidebarModeSection'
import { ThemeSection } from './general/ThemeSection'

export function GeneralTab({ onSidebarModeChange }: { onSidebarModeChange: (mode: SidebarMode) => void }) {
  const {
    sidebarMode,
    defaultProjectPath,
    themeId,
    notificationMode,
    uiFontSize,
    uiZoomPercent,
    quickPanelEnabled,
    shortcutConfig,
    claudeBinaryPath,
    setDefaultProjectPath,
    setThemeId,
    setNotificationMode,
    setUiFontSize,
    setUiZoomPercent,
    setQuickPanelEnabled,
    setShortcut,
    setClaudeBinaryPath,
    importSession,
  } = useSessionsStore()

  return (
    <div className="space-y-4 p-4">
      <ThemeSection themeId={themeId} onChange={setThemeId} />
      <DefaultProjectSection
        defaultProjectPath={defaultProjectPath}
        onChange={setDefaultProjectPath}
      />
      <DisplaySection
        uiFontSize={uiFontSize}
        uiZoomPercent={uiZoomPercent}
        onFontSizeChange={setUiFontSize}
        onZoomChange={setUiZoomPercent}
      />
      <ClaudeBinaryPathSection
        claudeBinaryPath={claudeBinaryPath}
        onChange={setClaudeBinaryPath}
      />
      <NotificationSection
        notificationMode={notificationMode}
        onChange={setNotificationMode}
      />
      <QuickPanelSection
        quickPanelEnabled={quickPanelEnabled}
        onToggle={setQuickPanelEnabled}
      />
      <SidebarModeSection
        sidebarMode={sidebarMode}
        onChange={onSidebarModeChange}
      />
      <CliImportSection onImportSession={importSession} />
      <ShortcutSection
        shortcutConfig={shortcutConfig}
        onShortcutChange={setShortcut}
      />
    </div>
  )
}
