import { useEffect, useState } from 'react'
import { useSessionsStore } from '../../store/sessions'
import { cx } from '../ui/appDesignSystem'
import { ClaudeBinaryPathSection } from './general/ClaudeBinaryPathSection'
import { CliImportSection } from './general/CliImportSection'
import { DefaultProjectSection } from './general/DefaultProjectSection'
import { DisplaySection } from './general/DisplaySection'
import { LanguageSection } from './general/LanguageSection'
import { NotificationSection } from './general/NotificationSection'
import { QuickPanelSection } from './general/QuickPanelSection'
import { ShortcutSection } from './general/ShortcutSection'
import { ThemeSection } from './general/ThemeSection'

type GeneralSectionId = 'display' | 'session' | 'notifications' | 'shortcuts' | 'claude'

type SectionDef = {
  id: GeneralSectionId
  group: 'environment' | 'input'
  title: string
  desc: string
}

const SECTIONS: SectionDef[] = [
  { id: 'display', group: 'environment', title: '표시', desc: '조밀한 밀도와 기본 화면' },
  { id: 'session', group: 'environment', title: '세션 복구', desc: '마지막 작업 복원과 기록 보존' },
  { id: 'notifications', group: 'environment', title: '알림', desc: '배너와 완료 신호음' },
  { id: 'shortcuts', group: 'input', title: '단축키', desc: '빠른 호출과 탐색 키' },
  { id: 'claude', group: 'input', title: 'Claude 설정', desc: '실행 경로와 가져오기' },
]

const GROUPS = [
  { id: 'environment', title: '환경' },
  { id: 'input', title: '입력' },
] as const

export function GeneralTab({ onCountUpdate }: { onCountUpdate?: (count: number) => void }) {
  const [selected, setSelected] = useState<GeneralSectionId>('display')
  const {
    appLanguage,
    defaultProjectPath,
    themeId,
    notificationMode,
    uiFontSize,
    uiZoomPercent,
    autoHtmlPreview,
    quickPanelEnabled,
    shortcutConfig,
    claudeBinaryPath,
    setDefaultProjectPath,
    setAppLanguage,
    setThemeId,
    setNotificationMode,
    setUiFontSize,
    setUiZoomPercent,
    setAutoHtmlPreview,
    setQuickPanelEnabled,
    setShortcut,
    setClaudeBinaryPath,
    importSession,
  } = useSessionsStore()

  useEffect(() => {
    onCountUpdate?.(SECTIONS.length)
  }, [onCountUpdate])

  return (
    <div className="flex h-full">
      {/* Middle: section list */}
      <div className="flex w-[286px] shrink-0 flex-col border-r border-claude-border bg-claude-sidebar/50">
        <div className="flex h-[42px] items-center justify-between border-b border-claude-border/50 px-3">
          <p className="text-[13px] font-semibold text-claude-text">일반</p>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-2">
          {GROUPS.map((group) => (
            <div key={group.id} className="mb-3">
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-claude-muted/60">
                {group.title}
              </p>
              <div className="space-y-0.5">
                {SECTIONS.filter((s) => s.group === group.id).map((section) => (
                  <button
                    key={section.id}
                    onClick={() => setSelected(section.id)}
                    className={cx(
                      'flex min-h-[44px] w-full flex-col items-start rounded-md px-3 py-2 text-left transition-colors',
                      selected === section.id
                        ? 'bg-claude-surface'
                        : 'hover:bg-claude-panel',
                    )}
                  >
                    <span className={cx(
                      'text-[13px] font-medium leading-none',
                      selected === section.id ? 'text-claude-text' : 'text-claude-text/80',
                    )}>
                      {section.title}
                    </span>
                    <span className="mt-0.5 text-[11px] leading-relaxed text-claude-muted">
                      {section.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* Right: section detail */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-claude-bg">
        {/* Section header */}
        <div className="sticky top-0 z-10 flex h-[42px] items-center justify-between border-b border-claude-border/50 bg-claude-bg/95 px-4 backdrop-blur-sm">
          <p className="text-[13px] font-semibold text-claude-text">
            {SECTIONS.find((s) => s.id === selected)?.title}
          </p>
        </div>

        {/* Section content */}
        <div className="divide-y divide-claude-border/60">
          {selected === 'display' && (
            <>
              <DisplaySection
                uiFontSize={uiFontSize}
                uiZoomPercent={uiZoomPercent}
                autoHtmlPreview={autoHtmlPreview}
                onFontSizeChange={setUiFontSize}
                onZoomChange={setUiZoomPercent}
                onAutoHtmlPreviewChange={setAutoHtmlPreview}
              />
              <ThemeSection themeId={themeId} onChange={setThemeId} />
              <LanguageSection appLanguage={appLanguage} onChange={setAppLanguage} />
            </>
          )}
          {selected === 'session' && (
            <>
              <DefaultProjectSection
                defaultProjectPath={defaultProjectPath}
                onChange={setDefaultProjectPath}
              />
              <CliImportSection onImportSession={importSession} />
            </>
          )}
          {selected === 'notifications' && (
            <>
              <NotificationSection
                notificationMode={notificationMode}
                onChange={setNotificationMode}
              />
              <QuickPanelSection
                quickPanelEnabled={quickPanelEnabled}
                onToggle={setQuickPanelEnabled}
              />
            </>
          )}
          {selected === 'shortcuts' && (
            <ShortcutSection
              shortcutConfig={shortcutConfig}
              onShortcutChange={setShortcut}
            />
          )}
          {selected === 'claude' && (
            <ClaudeBinaryPathSection
              claudeBinaryPath={claudeBinaryPath}
              onChange={setClaudeBinaryPath}
            />
          )}
        </div>
      </div>
    </div>
  )
}
