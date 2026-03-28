import { useEffect, useState } from 'react'
import { useI18n } from '../../../hooks/useI18n'
import {
  DEFAULT_UI_FONT_SIZE,
  DEFAULT_UI_ZOOM_PERCENT,
  MAX_UI_FONT_SIZE,
  MAX_UI_ZOOM_PERCENT,
  MIN_UI_FONT_SIZE,
  MIN_UI_ZOOM_PERCENT,
} from '../../../store/sessions'

type Props = {
  uiFontSize: number
  uiZoomPercent: number
  autoHtmlPreview: boolean
  onFontSizeChange: (value: number) => void
  onZoomChange: (value: number) => void
  onAutoHtmlPreviewChange: (value: boolean) => void
}

export function DisplaySection({
  uiFontSize,
  uiZoomPercent,
  autoHtmlPreview,
  onFontSizeChange,
  onZoomChange,
  onAutoHtmlPreviewChange,
}: Props) {
  const { t } = useI18n()
  const [pendingZoom, setPendingZoom] = useState(uiZoomPercent)

  useEffect(() => {
    setPendingZoom(uiZoomPercent)
  }, [uiZoomPercent])

  const commitPendingZoom = (value: number) => {
    setPendingZoom(value)
    onZoomChange(value)
  }

  return (
    <div className="rounded-2xl border border-claude-border bg-claude-surface p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-claude-text">{t('settings.general.display.title')}</p>
          <p className="mt-1 text-xs leading-relaxed text-claude-muted">
            {t('settings.general.display.description')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            onFontSizeChange(DEFAULT_UI_FONT_SIZE)
            setPendingZoom(DEFAULT_UI_ZOOM_PERCENT)
            onZoomChange(DEFAULT_UI_ZOOM_PERCENT)
          }}
          className="rounded-xl border border-claude-border bg-claude-panel px-3 py-2 text-xs text-claude-muted transition-colors hover:bg-claude-bg hover:text-claude-text"
        >
          {t('settings.general.display.restoreDefaults')}
        </button>
      </div>

      <div className="mt-4 space-y-4 rounded-xl border border-claude-border bg-claude-panel p-3">
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <label className="text-xs font-medium text-claude-muted">{t('settings.general.display.fontSize')}</label>
            <span className="text-xs font-mono text-claude-text">{uiFontSize}px</span>
          </div>
          <input
            type="range"
            min={MIN_UI_FONT_SIZE}
            max={MAX_UI_FONT_SIZE}
            step={1}
            value={uiFontSize}
            onChange={(event) => onFontSizeChange(Number(event.target.value))}
            className="w-full accent-claude-muted"
          />
          <div className="mt-1 flex items-center justify-between text-[11px] text-claude-muted/80">
            <span>{MIN_UI_FONT_SIZE}px</span>
            <span>{MAX_UI_FONT_SIZE}px</span>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <label className="text-xs font-medium text-claude-muted">{t('settings.general.display.uiScale')}</label>
            <span className="text-xs font-mono text-claude-text">{pendingZoom}%</span>
          </div>
          <input
            type="range"
            min={MIN_UI_ZOOM_PERCENT}
            max={MAX_UI_ZOOM_PERCENT}
            step={10}
            value={pendingZoom}
            onChange={(event) => setPendingZoom(Number(event.target.value))}
            onMouseUp={(event) => commitPendingZoom(Number(event.currentTarget.value))}
            onTouchEnd={(event) => commitPendingZoom(Number(event.currentTarget.value))}
            onBlur={(event) => commitPendingZoom(Number(event.currentTarget.value))}
            onKeyUp={(event) => commitPendingZoom(Number((event.currentTarget as HTMLInputElement).value))}
            className="w-full accent-claude-muted"
          />
          <div className="mt-1 flex items-center justify-between text-[11px] text-claude-muted/80">
            <span>{MIN_UI_ZOOM_PERCENT}%</span>
            <span>{MAX_UI_ZOOM_PERCENT}%</span>
          </div>
        </div>

        <div className="rounded-xl border border-claude-border/70 bg-claude-bg px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-claude-text">{t('settings.general.display.autoHtmlPreview')}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-claude-muted">
                {t('settings.general.display.autoHtmlPreviewDescription')}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoHtmlPreview}
              onClick={() => onAutoHtmlPreviewChange(!autoHtmlPreview)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                autoHtmlPreview ? 'bg-claude-surface-2' : 'bg-claude-panel'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${
                  autoHtmlPreview ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
