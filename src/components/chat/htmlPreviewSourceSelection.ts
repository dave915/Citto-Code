export type HtmlPreviewSourceSelectionMode = 'auto' | 'manual'

export type HtmlPreviewSourceSelectionCandidate = {
  id: string
  kind: 'url' | 'file'
}

function getDefaultHtmlPreviewSourceId(
  sources: HtmlPreviewSourceSelectionCandidate[],
): string | null {
  if (sources.length === 0) return null
  return (sources.find((source) => source.kind === 'url') ?? sources[0]).id
}

export function resolveHtmlPreviewSourceSelection({
  sources,
  selectedSourceId,
  selectionMode,
}: {
  sources: HtmlPreviewSourceSelectionCandidate[]
  selectedSourceId: string | null
  selectionMode: HtmlPreviewSourceSelectionMode
}): {
  selectedSourceId: string | null
  selectionMode: HtmlPreviewSourceSelectionMode
} {
  const defaultSourceId = getDefaultHtmlPreviewSourceId(sources)
  if (!defaultSourceId) {
    return {
      selectedSourceId: null,
      selectionMode: 'auto',
    }
  }

  const hasSelectedSource = selectedSourceId
    ? sources.some((source) => source.id === selectedSourceId)
    : false

  if (selectionMode === 'manual') {
    if (hasSelectedSource) {
      return {
        selectedSourceId,
        selectionMode,
      }
    }

    return {
      selectedSourceId: defaultSourceId,
      selectionMode: 'auto',
    }
  }

  return {
    selectedSourceId: defaultSourceId,
    selectionMode: 'auto',
  }
}
