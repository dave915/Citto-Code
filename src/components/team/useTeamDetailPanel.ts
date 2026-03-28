import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { clampDetailPanelWidth, DETAIL_PANEL_DEFAULT_WIDTH } from './TeamViewParts'

type DetailPanelResizeState = {
  startX: number
  startWidth: number
}

export function useTeamDetailPanel() {
  const [detailPanelWidth, setDetailPanelWidth] = useState(DETAIL_PANEL_DEFAULT_WIDTH)
  const [isResizingDetailPanel, setIsResizingDetailPanel] = useState(false)
  const detailPanelResizeStateRef = useRef<DetailPanelResizeState | null>(null)

  useEffect(() => {
    setDetailPanelWidth((current) => clampDetailPanelWidth(current))

    const handleWindowResize = () => {
      setDetailPanelWidth((current) => clampDetailPanelWidth(current))
    }

    window.addEventListener('resize', handleWindowResize)
    return () => window.removeEventListener('resize', handleWindowResize)
  }, [])

  useEffect(() => {
    if (!isResizingDetailPanel) return

    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = detailPanelResizeStateRef.current
      if (!resizeState) return

      const deltaX = event.clientX - resizeState.startX
      setDetailPanelWidth(clampDetailPanelWidth(resizeState.startWidth - deltaX))
    }

    const handlePointerEnd = () => {
      detailPanelResizeStateRef.current = null
      setIsResizingDetailPanel(false)
    }

    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerEnd)
    window.addEventListener('pointercancel', handlePointerEnd)

    return () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerEnd)
      window.removeEventListener('pointercancel', handlePointerEnd)
    }
  }, [isResizingDetailPanel])

  const handleDetailPanelResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return

      detailPanelResizeStateRef.current = {
        startX: event.clientX,
        startWidth: detailPanelWidth,
      }
      setIsResizingDetailPanel(true)
      event.preventDefault()
    },
    [detailPanelWidth],
  )

  const detailPanelStyle: CSSProperties = {
    ['--team-detail-width' as string]: `${detailPanelWidth}px`,
  }

  return {
    detailPanelStyle,
    handleDetailPanelResizeStart,
  }
}
