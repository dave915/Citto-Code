import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../../hooks/useI18n'
import { pickLocalized } from '../../../lib/i18n'
import { THEME_PRESETS, applyTheme, type ThemeId, type ThemePreset } from '../../../lib/theme'
import { cx } from '../../ui/appDesignSystem'
import { SettingsSection } from '../shared'

type ThemeOption = ThemePreset & {
  id: ThemeId
}

type Props = {
  themeId: ThemeId
  onChange: (themeId: ThemeId) => void
}

const themeOptions = Object.values(THEME_PRESETS) as ThemeOption[]

export function ThemeSection({ themeId, onChange }: Props) {
  const { language, t } = useI18n()
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const [themePreviewId, setThemePreviewId] = useState<ThemeId | null>(null)
  const [themeHighlightId, setThemeHighlightId] = useState<ThemeId>(themeId)
  const themeMenuRef = useRef<HTMLDivElement | null>(null)
  const themeMenuContainerRef = useRef<HTMLDivElement | null>(null)
  const activeThemeId = themePreviewId ?? themeId

  useEffect(() => {
    if (!themeMenuOpen) {
      setThemeHighlightId(themeId)
      setThemePreviewId(null)
      applyTheme(themeId)
    }
  }, [themeId, themeMenuOpen])

  useEffect(() => {
    if (!themeMenuOpen) return

    themeMenuRef.current?.focus()

    const handlePointerDown = (event: MouseEvent) => {
      if (!themeMenuContainerRef.current?.contains(event.target as Node)) {
        setThemeMenuOpen(false)
        setThemePreviewId(null)
        setThemeHighlightId(themeId)
        applyTheme(themeId)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [themeMenuOpen, themeId])

  const previewTheme = (nextThemeId: ThemeId) => {
    setThemeHighlightId(nextThemeId)
    setThemePreviewId(nextThemeId)
    applyTheme(nextThemeId)
  }

  const commitTheme = (nextThemeId: ThemeId) => {
    onChange(nextThemeId)
    setThemeHighlightId(nextThemeId)
    setThemePreviewId(null)
    applyTheme(nextThemeId)
    setThemeMenuOpen(false)
  }

  const closeThemeMenu = () => {
    setThemeMenuOpen(false)
    setThemePreviewId(null)
    setThemeHighlightId(themeId)
    applyTheme(themeId)
  }

  const moveThemeHighlight = (direction: 1 | -1) => {
    const currentIndex = themeOptions.findIndex((option) => option.id === themeHighlightId)
    const safeIndex = currentIndex < 0 ? 0 : currentIndex
    const nextIndex = Math.min(themeOptions.length - 1, Math.max(0, safeIndex + direction))
    previewTheme(themeOptions[nextIndex].id)
  }

  return (
    <SettingsSection
      title={t('settings.general.theme.title')}
      description={t('settings.general.theme.description')}
    >
      <div className="rounded-md border border-claude-border bg-claude-panel/35 px-3 py-3">
        <label className="mb-2 block text-xs font-medium text-claude-muted">{t('settings.general.theme.preset')}</label>
        <div ref={themeMenuContainerRef} className="relative flex items-center gap-3">
          <div className="relative flex-1">
            <button
              type="button"
              onClick={() => {
                if (themeMenuOpen) {
                  closeThemeMenu()
                  return
                }
                setThemeHighlightId(themeId)
                setThemePreviewId(themeId)
                applyTheme(themeId)
                setThemeMenuOpen(true)
              }}
              onKeyDown={(event) => {
                if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !themeMenuOpen) {
                  event.preventDefault()
                  setThemeHighlightId(themeId)
                  setThemePreviewId(themeId)
                  applyTheme(themeId)
                  setThemeMenuOpen(true)
                }
              }}
              className="flex w-full items-center justify-between rounded-md border border-claude-border bg-claude-bg px-3 py-2 text-[13px] text-claude-text outline-none transition-colors focus:border-claude-orange/35 focus:ring-1 focus:ring-claude-orange/15"
              aria-haspopup="listbox"
              aria-expanded={themeMenuOpen}
            >
              <span>{THEME_PRESETS[activeThemeId].label}</span>
              <svg className={`h-4 w-4 text-claude-muted transition-transform ${themeMenuOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {themeMenuOpen && (
              <div
                ref={themeMenuRef}
                tabIndex={0}
                role="listbox"
                aria-activedescendant={`theme-option-${themeHighlightId}`}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    moveThemeHighlight(1)
                    return
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    moveThemeHighlight(-1)
                    return
                  }
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    commitTheme(themeHighlightId)
                    return
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    closeThemeMenu()
                  }
                }}
                className="absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-md border border-claude-border bg-claude-panel outline-none shadow-none"
              >
                {themeOptions.map((theme) => {
                  const highlighted = theme.id === themeHighlightId
                  return (
                    <button
                      key={theme.id}
                      id={`theme-option-${theme.id}`}
                      type="button"
                      role="option"
                      aria-selected={highlighted}
                      onMouseEnter={() => previewTheme(theme.id)}
                      onFocus={() => previewTheme(theme.id)}
                      onClick={() => commitTheme(theme.id)}
                      className={cx(
                        'flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors',
                        highlighted ? 'bg-claude-bg text-claude-text' : 'text-claude-text hover:bg-claude-surface',
                      )}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{theme.label}</div>
                        <div className="mt-0.5 text-xs leading-relaxed text-claude-muted">
                          {pickLocalized(language, {
                            ko: theme.description,
                            en: THEME_PRESETS[theme.id].descriptionEn,
                          })}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {theme.swatches.map((swatch) => (
                          <span
                            key={swatch}
                            className="h-3 w-3 rounded-full border border-white/10"
                            style={{ backgroundColor: swatch }}
                          />
                        ))}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {THEME_PRESETS[activeThemeId].swatches.map((swatch) => (
              <span
                key={swatch}
                className="h-3 w-3 rounded-full border border-white/10"
                style={{ backgroundColor: swatch }}
              />
            ))}
          </div>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-claude-muted">
          {pickLocalized(language, {
            ko: THEME_PRESETS[activeThemeId].description,
            en: THEME_PRESETS[activeThemeId].descriptionEn,
          })}
        </p>
      </div>
    </SettingsSection>
  )
}
