import { useEffect, useMemo, useRef, useState } from 'react'

type AttachmentImageSource = {
  name?: string
  path: string
  size: number
  fileType?: 'text' | 'image'
  dataUrl?: string
}

const VIRTUAL_ATTACHMENT_PATH_PREFIXES = ['clipboard://', 'drop://']
const IMAGE_FILE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif', '.bmp', '.ico', '.heic', '.heif'])

function hasImageExtension(value: string | undefined) {
  const normalized = (value ?? '').trim().toLowerCase()
  return Array.from(IMAGE_FILE_EXTENSIONS).some((extension) => normalized.endsWith(extension))
}

export function isImageAttachment(file: AttachmentImageSource): file is AttachmentImageSource & { fileType: 'image' } {
  return (
    file.fileType === 'image'
    || (typeof file.dataUrl === 'string' && file.dataUrl.startsWith('data:image/'))
    || hasImageExtension(file.path)
    || hasImageExtension(file.name)
  )
}

export function canOpenAttachmentPath(filePath: string): boolean {
  const trimmedPath = filePath.trim()
  return trimmedPath.length > 0 && !VIRTUAL_ATTACHMENT_PATH_PREFIXES.some((prefix) => trimmedPath.startsWith(prefix))
}

export function useAttachmentImageDataUrls(files: AttachmentImageSource[]) {
  const [imageDataUrls, setImageDataUrls] = useState<Record<string, string>>({})
  const lastLoadKeyRef = useRef<string>('')

  const imageFiles = useMemo(
    () => files.filter(isImageAttachment),
    [files],
  )

  const imageLoadKey = useMemo(
    () => imageFiles
      .map((file) => `${file.path}:${file.size}:${file.name ?? ''}:${typeof file.dataUrl === 'string' ? file.dataUrl.length : 0}`)
      .join('|'),
    [imageFiles],
  )
  const hasLoadedAllImageUrls = useMemo(
    () => imageFiles.every((file) => {
      const src = imageDataUrls[file.path]
      return typeof src === 'string' && src.startsWith('data:image/')
    }),
    [imageDataUrls, imageFiles],
  )

  useEffect(() => {
    let cancelled = false

    if (imageLoadKey === lastLoadKeyRef.current && hasLoadedAllImageUrls) return
    lastLoadKeyRef.current = imageLoadKey

    if (imageFiles.length === 0) {
      setImageDataUrls({})
      return
    }

    void (async () => {
      const pairs = await Promise.all(
        imageFiles.map(async (file) => {
          const inlineDataUrl = typeof file.dataUrl === 'string' ? file.dataUrl.trim() : ''
          if (inlineDataUrl.length > 0) return [file.path, inlineDataUrl] as const
          if (!canOpenAttachmentPath(file.path)) return null

          const dataUrl = await window.claude.readFileDataUrl(file.path)
          return dataUrl ? [file.path, dataUrl] as const : null
        }),
      )

      if (cancelled) return

      const nextImageDataUrls = Object.fromEntries(
        pairs.filter((pair): pair is readonly [string, string] => pair !== null),
      )

      setImageDataUrls((current) => {
        const currentKeys = Object.keys(current)
        const nextKeys = Object.keys(nextImageDataUrls)
        if (
          currentKeys.length === nextKeys.length
          && currentKeys.every((key) => current[key] === nextImageDataUrls[key])
        ) {
          return current
        }
        return nextImageDataUrls
      })
    })()

    return () => {
      cancelled = true
    }
  }, [hasLoadedAllImageUrls, imageFiles, imageLoadKey])

  return imageDataUrls
}
