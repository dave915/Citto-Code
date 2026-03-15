export function toFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const encodedPath = encodeURI(normalized).replace(/\?/g, '%3F').replace(/#/g, '%23')

  if (/^[A-Za-z]:\//.test(normalized)) {
    return `file:///${encodedPath}`
  }

  return normalized.startsWith('/') ? `file://${encodedPath}` : `file:///${encodedPath}`
}

export function joinPreviewPath(basePath: string, relativePath: string): string {
  if (!relativePath) return basePath
  if (/^[A-Za-z]:[\\/]/.test(relativePath) || relativePath.startsWith('/')) return relativePath

  const normalizedBase = basePath.replace(/\\/g, '/').replace(/\/+$/, '')
  const normalizedRelative = relativePath.replace(/\\/g, '/').replace(/^\.?\//, '')
  return `${normalizedBase}/${normalizedRelative}`
}

export function resolveMarkdownPreviewUrl(baseFilePath: string, url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return trimmed

  if (/^[A-Za-z]:[\\/]/.test(trimmed)) {
    return toFileUrl(trimmed)
  }

  if (
    trimmed.startsWith('#')
    || trimmed.startsWith('//')
    || /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)
  ) {
    return trimmed
  }

  try {
    return new URL(trimmed, toFileUrl(baseFilePath)).href
  } catch {
    return trimmed
  }
}

export function fileUrlToPath(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'file:') return null

    const decodedPath = decodeURIComponent(parsed.pathname)
    if (/^\/[A-Za-z]:\//.test(decodedPath)) {
      return decodedPath.slice(1)
    }

    return decodedPath
  } catch {
    return null
  }
}

export function normalizeMarkdownImageReference(reference: string): string {
  const trimmed = reference.trim()
  if (!trimmed) return ''

  if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
    return trimmed.slice(1, -1)
  }

  const titleSeparated = trimmed.match(/^(\S+)\s+["'(]/)
  return titleSeparated ? titleSeparated[1] : trimmed
}

export function extractMarkdownImageUrls(markdown: string): string[] {
  const urls = new Set<string>()

  for (const match of markdown.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    const src = match[1]?.trim()
    if (src) urls.add(src)
  }

  for (const match of markdown.matchAll(/!\[[^\]]*]\(([^)\n]+)\)/g)) {
    const src = normalizeMarkdownImageReference(match[1] ?? '')
    if (src) urls.add(src)
  }

  return [...urls]
}

export function isMarkdownFile(name: string): boolean {
  return /\.(md|mdx|markdown)$/i.test(name)
}

export function isTextPreviewable(name: string): boolean {
  return /\.(txt|md|json|ya?ml|toml|xml|html|css|scss|ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|swift|rb|php|sh|zsh|env|sql|graphql|proto)$/i.test(name)
}
