import { useEffect, useState } from 'react'
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
  onFontSizeChange: (value: number) => void
  onZoomChange: (value: number) => void
}

export function DisplaySection({
  uiFontSize,
  uiZoomPercent,
  onFontSizeChange,
  onZoomChange,
}: Props) {
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
          <p className="text-sm font-semibold text-claude-text">표시</p>
          <p className="mt-1 text-xs leading-relaxed text-claude-muted">
            글자 크기와 전체 UI 배율을 조절합니다. 화면 배율은 슬라이더를 놓는 시점에 반영됩니다.
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
          기본값 복원
        </button>
      </div>

      <div className="mt-4 space-y-4 rounded-xl border border-claude-border bg-claude-panel p-3">
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <label className="text-xs font-medium text-claude-muted">폰트 크기</label>
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
            <label className="text-xs font-medium text-claude-muted">화면 비율</label>
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
      </div>
    </div>
  )
}
