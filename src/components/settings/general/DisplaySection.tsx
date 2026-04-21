import { useEffect, useState } from 'react'
import { useI18n } from '../../../hooks/useI18n'
import {
  DEFAULT_UI_FONT_SIZE,
  DEFAULT_UI_ZOOM_PERCENT,
} from '../../../store/sessions'
import { AppButton, AppSwitch, cx } from '../../ui/appDesignSystem'
import { SettingsSection } from '../shared'

type Props = {
  uiFontSize: number
  uiZoomPercent: number
  autoHtmlPreview: boolean
  onFontSizeChange: (value: number) => void
  onZoomChange: (value: number) => void
  onAutoHtmlPreviewChange: (value: boolean) => void
}

const DENSITY_OPTIONS = [
  { label: '조밀', fontSize: 13, zoom: 90, desc: '한 화면의 정보량을 우선합니다.' },
  { label: '표준', fontSize: DEFAULT_UI_FONT_SIZE, zoom: DEFAULT_UI_ZOOM_PERCENT, desc: 'Paper 시안 기준 밀도입니다.' },
  { label: '넉넉', fontSize: 16, zoom: 100, desc: '읽기 편한 여백을 둡니다.' },
] as const

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
  const activeDensity = DENSITY_OPTIONS.find((option) => (
    option.fontSize === uiFontSize && option.zoom === uiZoomPercent
  )) ?? DENSITY_OPTIONS[1]

  useEffect(() => {
    setPendingZoom(uiZoomPercent)
  }, [uiZoomPercent])

  const applyDensity = (fontSize: number, zoom: number) => {
    onFontSizeChange(fontSize)
    setPendingZoom(zoom)
    onZoomChange(zoom)
  }

  return (
    <SettingsSection
      title={t('settings.general.display.title')}
      description={t('settings.general.display.description')}
      action={(
        <AppButton
          onClick={() => {
            onFontSizeChange(DEFAULT_UI_FONT_SIZE)
            setPendingZoom(DEFAULT_UI_ZOOM_PERCENT)
            onZoomChange(DEFAULT_UI_ZOOM_PERCENT)
          }}
        >
          {t('settings.general.display.restoreDefaults')}
        </AppButton>
      )}
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="rounded-md border border-claude-border bg-claude-panel/55 px-4 py-3">
          <p className="text-[11px] text-claude-muted">현재 프리셋</p>
          <p className="mt-1 text-[13px] font-semibold text-claude-text">집중 작업용</p>
          <p className="mt-1 text-[11px] leading-5 text-claude-muted">
            정보 밀도는 높이고, 보조 텍스트는 한 단계 낮춰 화면이 덜 떠 보이도록 조정합니다.
          </p>
        </div>

        <div className="rounded-md border border-claude-border bg-claude-panel/45 px-4 py-3">
          <p className="text-[11px] text-claude-muted">기본 화면</p>
          <p className="mt-1 text-[13px] font-semibold text-claude-text">새 세션</p>
          <p className="mt-1 text-[11px] leading-5 text-claude-muted">앱 시작 직후 바로 입력 가능합니다.</p>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        <p className="text-[11px] font-medium text-claude-muted">레이아웃</p>
        <div className="flex min-h-[44px] items-center justify-between gap-4 rounded-md bg-claude-panel/35 px-3 py-2">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-claude-text">밀도</p>
            <p className="mt-0.5 text-[11px] text-claude-muted">{activeDensity.desc}</p>
          </div>
          <div className="flex rounded-md bg-claude-bg p-1">
            {DENSITY_OPTIONS.map((option) => {
              const active = option.label === activeDensity.label
              return (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => applyDensity(option.fontSize, option.zoom)}
                  className={cx(
                    'h-7 rounded px-3 text-[11px] transition-colors',
                    active
                      ? 'bg-claude-surface text-claude-text'
                      : 'text-claude-muted hover:bg-claude-panel hover:text-claude-text',
                  )}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex min-h-[44px] items-center justify-between gap-4 rounded-md bg-claude-panel/35 px-3 py-2">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-claude-text">{t('settings.general.display.uiScale')}</p>
            <p className="mt-0.5 text-[11px] text-claude-muted">
              {t('settings.general.display.fontSize')} {uiFontSize}px · {pendingZoom}%
            </p>
          </div>
          <div className="text-[11px] font-medium text-claude-muted">좁게</div>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        <p className="text-[11px] font-medium text-claude-muted">동작</p>
        <div className="flex min-h-[44px] items-center justify-between gap-4 rounded-md bg-claude-panel/35 px-3 py-2">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-claude-text">{t('settings.general.display.autoHtmlPreview')}</p>
            <p className="mt-0.5 text-[11px] leading-5 text-claude-muted">
              {t('settings.general.display.autoHtmlPreviewDescription')}
            </p>
          </div>
          <AppSwitch
            checked={autoHtmlPreview}
            onClick={() => onAutoHtmlPreviewChange(!autoHtmlPreview)}
          />
        </div>
      </div>

      <div className="mt-5 rounded-md border border-claude-border bg-claude-panel/35 p-3">
        <p className="text-[11px] font-medium text-claude-muted">미리보기</p>
        <div className="mt-3 flex gap-3 rounded-md bg-claude-bg/50 p-3">
          <div className="w-44 shrink-0 space-y-2">
            <div className="h-4 rounded bg-claude-surface" />
            <div className="h-3 rounded bg-claude-surface/70" />
            <div className="h-3 rounded bg-claude-surface/70" />
            <div className="h-3 rounded bg-claude-surface/70" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-48 rounded bg-claude-surface" />
            <div className="h-3 rounded bg-claude-surface/70" />
            <div className="h-3 w-5/6 rounded bg-claude-surface/70" />
            <div className="h-3 w-4/6 rounded bg-claude-surface/70" />
          </div>
        </div>
      </div>
    </SettingsSection>
  )
}
