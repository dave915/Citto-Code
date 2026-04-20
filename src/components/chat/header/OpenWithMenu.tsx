import type { MutableRefObject } from 'react'
import type { OpenWithApp } from '../../../../electron/preload'
import { useI18n } from '../../../hooks/useI18n'
import { OpenWithAppIcon } from '../OpenWithAppIcon'

type Props = {
  openWithMenuRef: MutableRefObject<HTMLDivElement | null>
  openWithMenuOpen: boolean
  openWithLoading: boolean
  openWithApps: OpenWithApp[]
  defaultOpenWithApp: OpenWithApp | null
  preferredOpenWithAppId: string
  onDefaultOpen: () => void | Promise<void>
  onToggleOpenWithMenu: () => void
  onOpenWith: (appId: string) => void | Promise<void>
}

export function OpenWithMenu({
  openWithMenuRef,
  openWithMenuOpen,
  openWithLoading,
  openWithApps,
  defaultOpenWithApp,
  preferredOpenWithAppId,
  onDefaultOpen,
  onToggleOpenWithMenu,
  onOpenWith,
}: Props) {
  const { t } = useI18n()
  return (
    <div ref={openWithMenuRef} className="relative" data-no-drag="true">
      <div className="flex overflow-hidden rounded-lg border border-claude-border bg-claude-surface">
        <button
          onClick={() => void onDefaultOpen()}
          disabled={openWithApps.length === 0}
          className="inline-flex items-center gap-1.5 bg-claude-surface px-2 py-1 font-mono text-[11px] text-claude-text transition-colors hover:bg-claude-surface-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-claude-surface"
          title={defaultOpenWithApp ? t('openWith.defaultWithApp', { appLabel: defaultOpenWithApp.label }) : t('openWith.default')}
        >
          <OpenWithAppIcon app={defaultOpenWithApp} />
          <span>{t('openWith.open')}</span>
        </button>
        <button
          onClick={onToggleOpenWithMenu}
          disabled={openWithApps.length === 0}
          className={`border-l border-claude-border px-2 py-1 text-claude-text transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-claude-surface ${
            openWithMenuOpen ? 'bg-claude-surface-2' : 'bg-claude-surface hover:bg-claude-surface-2'
          }`}
          title={t('openWith.menuTitle')}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>

      {openWithMenuOpen && (
        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-lg border border-claude-border bg-claude-panel p-2 shadow-2xl">
          <p className="px-3 pb-2 pt-1 text-xs font-semibold text-claude-muted">{t('openWith.menuTitle')}</p>
          {openWithLoading ? (
            <div className="flex items-center justify-center px-3 py-8 text-claude-muted">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
              </svg>
            </div>
          ) : openWithApps.length === 0 ? (
            <div className="px-3 py-6 text-sm text-claude-muted">{t('openWith.none')}</div>
          ) : (
            <div className="space-y-1">
              {openWithApps.map((app) => (
                <button
                  key={app.id}
                  onClick={() => void onOpenWith(app.id)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-claude-text transition-colors hover:bg-claude-surface"
                >
                  <OpenWithAppIcon app={app} className="h-8 w-8" />
                  <span className="flex-1">{app.label}</span>
                  {preferredOpenWithAppId === app.id && (
                    <svg className="h-4 w-4 text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
