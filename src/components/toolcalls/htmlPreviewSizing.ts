function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/g, '\n')
}

function isRootSelector(selector: string): boolean {
  return /(^|[\s>+~,])(?:html|body|main|:root|#root|#app)(?=$|[\s>+~,.#[:])/i.test(selector)
}

function collectRootLayoutStyles(html: string): string {
  const cssBlocks: string[] = []
  const blockRegex = /([^{}]+)\{([^{}]*)\}/g

  for (const match of html.matchAll(blockRegex)) {
    const selector = match[1]?.trim() ?? ''
    const declarations = match[2]?.trim() ?? ''
    if (!selector || !declarations || !isRootSelector(selector)) continue
    cssBlocks.push(declarations)
  }

  const inlineStyleRegex = /<(html|body|main)\b[^>]*\sstyle=(["'])(.*?)\2/gi
  for (const match of html.matchAll(inlineStyleRegex)) {
    const declarations = match[3]?.trim() ?? ''
    if (!declarations) continue
    cssBlocks.push(declarations)
  }

  return cssBlocks.join('\n')
}

export function isViewportSizedPreview(html: string): boolean {
  const normalized = normalizeNewlines(html)
  const rootLayoutStyles = collectRootLayoutStyles(normalized)
  if (!rootLayoutStyles) return false

  const hasViewportHeight = /(?:min-height|height)\s*:\s*100(?:d|s|l)?vh/i.test(rootLayoutStyles)
  const hasFixedLayout = /position\s*:\s*fixed/i.test(rootLayoutStyles) || /inset\s*:\s*0/i.test(rootLayoutStyles)
  const hidesOverflow = /overflow\s*:\s*hidden/i.test(rootLayoutStyles)
  const hasCenteredViewportLayout = /display\s*:\s*(?:flex|inline-flex|grid|inline-grid)/i.test(rootLayoutStyles)
    && (
      (/justify-content\s*:\s*center/i.test(rootLayoutStyles) && /align-items\s*:\s*center/i.test(rootLayoutStyles))
      || /place-items\s*:\s*center/i.test(rootLayoutStyles)
    )
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
