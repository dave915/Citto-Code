function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/g, '\n')
}

export function isViewportSizedPreview(html: string): boolean {
  const normalized = normalizeNewlines(html)
  const hasViewportHeight = /(?:min-height|height)\s*:\s*100(?:d|s|l)?vh/i.test(normalized)
  const hasFixedLayout = /position\s*:\s*fixed/i.test(normalized) || /inset\s*:\s*0/i.test(normalized)
  const hidesOverflow = /overflow\s*:\s*hidden/i.test(normalized)
  const hasCenteredViewportLayout = /display\s*:\s*(?:flex|inline-flex|grid|inline-grid)/i.test(normalized)
    && /justify-content\s*:\s*center/i.test(normalized)
    && /align-items\s*:\s*center/i.test(normalized)
  return hasViewportHeight && (hasFixedLayout || hidesOverflow || hasCenteredViewportLayout)
}

export function getPreviewMinimumHeight(isViewportLayout: boolean, windowHeight: number): number {
  if (!isViewportLayout) return 420
  if (!windowHeight || !Number.isFinite(windowHeight)) return 560
  return Math.max(520, Math.min(Math.round(windowHeight * 0.58), 720))
}

export function resolvePreviewFrameHeight({
  isUrlPreview,
  isViewportLayout,
  measuredHeight,
  minimumFrameHeight,
}: {
  isUrlPreview: boolean
  isViewportLayout: boolean
  measuredHeight: number
  minimumFrameHeight: number
}): number | null {
  if (!Number.isFinite(measuredHeight) || measuredHeight <= 0) return null
  if (!isUrlPreview && isViewportLayout) {
    return minimumFrameHeight
  }
  return Math.max(minimumFrameHeight, Math.min(Math.ceil(measuredHeight), 1600))
}
