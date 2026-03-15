import { useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'

const DEFAULT_SIDEBAR_WIDTH = 290
const MIN_SIDEBAR_WIDTH = 180
const MAX_SIDEBAR_WIDTH = 420

export function useSidebarLayout() {
  const expandedSidebarWidthRef = useRef(DEFAULT_SIDEBAR_WIDTH)
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const handleSidebarResizeStart = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (sidebarCollapsed) return
    event.preventDefault()
    const startX = event.clientX
    const startWidth = sidebarWidth

    const onMouseMove = (moveEvent: MouseEvent) => {
      const nextWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, startWidth + (moveEvent.clientX - startX)))
      setSidebarWidth(nextWidth)
      expandedSidebarWidthRef.current = nextWidth
    }

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const handleToggleSidebar = () => {
    setSidebarCollapsed((previous) => {
      if (previous) {
        setSidebarWidth(expandedSidebarWidthRef.current)
        return false
      }

      expandedSidebarWidthRef.current = sidebarWidth
      return true
    })
  }

  return {
    sidebarWidth,
    sidebarCollapsed,
    handleSidebarResizeStart,
    handleToggleSidebar,
  }
}
