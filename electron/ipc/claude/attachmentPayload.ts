import { existsSync, readFileSync } from 'fs'
import { extname } from 'path'
import type { SelectedFile } from '../../preload'
import { MIME_TYPES_BY_EXTENSION } from '../../services/fileService'

type ClaudeInputContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image'
      source: {
        type: 'base64'
        media_type: string
        data: string
      }
    }

function imageBlockFromDataUrl(dataUrl: string): ClaudeInputContentBlock | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null

  const [, mediaType, data] = match
  if (!mediaType || !data) return null

  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: mediaType,
      data,
    },
  }
}

function imageBlockFromFile(file: SelectedFile): ClaudeInputContentBlock | null {
  if (file.fileType !== 'image') return null

  if (typeof file.dataUrl === 'string' && file.dataUrl.trim()) {
    return imageBlockFromDataUrl(file.dataUrl.trim())
  }

  const trimmedPath = file.path.trim()
  if (!trimmedPath || !existsSync(trimmedPath)) return null

  try {
    const mediaType = MIME_TYPES_BY_EXTENSION[extname(trimmedPath).toLowerCase()] ?? 'application/octet-stream'
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType,
        data: readFileSync(trimmedPath).toString('base64'),
      },
    }
  } catch {
    return null
  }
}

export function buildStreamJsonUserMessage(prompt: string, attachments: SelectedFile[] = []) {
  const contentBlocks: ClaudeInputContentBlock[] = []
  if (prompt.trim().length > 0) {
    contentBlocks.push({ type: 'text', text: prompt })
  }

  for (const file of attachments) {
    const imageBlock = imageBlockFromFile(file)
    if (imageBlock) {
      contentBlocks.push(imageBlock)
    }
  }

  return JSON.stringify({
    type: 'user',
    message: {
      role: 'user',
      content: contentBlocks.length === 1 && contentBlocks[0]?.type === 'text'
        ? contentBlocks[0].text
        : contentBlocks,
    },
  })
}
