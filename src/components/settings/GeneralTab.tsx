import { useSessionsStore } from '../../store/sessions'
import { ClaudeBinaryPathSection } from './general/ClaudeBinaryPathSection'
import { CliImportSection } from './general/CliImportSection'
import { DefaultProjectSection } from './general/DefaultProjectSection'
import { DisplaySection } from './general/DisplaySection'
import { LanguageSection } from './general/LanguageSection'
import { NotificationSection } from './general/NotificationSection'
import { SecretarySection } from './general/SecretarySection'
import { ShortcutSection } from './general/ShortcutSection'
import { ThemeSection } from './general/ThemeSection'

export function GeneralTab() {
  const {
    appLanguage,
    defaultProjectPath,
    themeId,
    notificationMode,
    uiFontSize,
    uiZoomPercent,
    autoHtmlPreview,
    secretaryEnabled,
    shortcutConfig,
    claudeBinaryPath,
    setDefaultProjectPath,
    setAppLanguage,
    setThemeId,
    setNotificationMode,
    setUiFontSize,
    setUiZoomPercent,
    setAutoHtmlPreview,
    setSecretaryEnabled,
    setShortcut,
    setClaudeBinaryPath,
    importSession,
  } = useSessionsStore()

  return (
    <div className="space-y-4 p-4">
      <LanguageSection appLanguage={appLanguage} onChange={setAppLanguage} />
      <ThemeSection themeId={themeId} onChange={setThemeId} />
      <DefaultProjectSection
        defaultProjectPath={defaultProjectPath}
        onChange={setDefaultProjectPath}
      />
      <DisplaySection
        uiFontSize={uiFontSize}
        uiZoomPercent={uiZoomPercent}
        autoHtmlPreview={autoHtmlPreview}
        onFontSizeChange={setUiFontSize}
        onZoomChange={setUiZoomPercent}
        onAutoHtmlPreviewChange={setAutoHtmlPreview}
      />
      <ClaudeBinaryPathSection
        claudeBinaryPath={claudeBinaryPath}
        onChange={setClaudeBinaryPath}
      />
      <NotificationSection
        notificationMode={notificationMode}
        onChange={setNotificationMode}
      />
      <SecretarySection
        secretaryEnabled={secretaryEnabled}
        onToggle={setSecretaryEnabled}
      />
      <CliImportSection onImportSession={importSession} />
      <ShortcutSection
        shortcutConfig={shortcutConfig}
        onShortcutChange={setShortcut}
      />
    </div>
  )
}
