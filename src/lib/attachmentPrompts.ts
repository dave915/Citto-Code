import type { SelectedFile } from '../../electron/preload'
import { translate, type AppLanguage } from './i18n'
import type { AttachedFile } from '../store/sessionTypes'

function resolveLanguage(language?: AppLanguage): AppLanguage {
  if (language) return language
  if (typeof document !== 'undefined' && document.documentElement.lang.startsWith('en')) {
    return 'en'
  }
  return 'ko'
}

export function buildPromptWithAttachments(
  text: string,
  files: SelectedFile[],
  language?: AppLanguage,
  options?: {
    includeImageReferences?: boolean
  },
) {
  if (files.length === 0) return text

  const resolvedLanguage = resolveLanguage(language)
  const includeImageReferences = options?.includeImageReferences ?? true
  const imageFiles = includeImageReferences
    ? files.filter((file) => file.fileType === 'image')
    : []
  let imageIndex = 0
  const fileSections = files
    .map((file) => {
      if (file.fileType === 'image') {
        if (!includeImageReferences) return ''
        imageIndex += 1
        return resolvedLanguage === 'en'
          ? [
              `Attached image ${imageIndex}: ${file.path}`,
              `Filename: ${file.name} (${file.size} bytes)`,
            ].join('\n')
          : [
              `첨부 이미지 ${imageIndex}: ${file.path}`,
              `파일명: ${file.name} (${file.size} bytes)`,
            ].join('\n')
      }

      return `<file path="${file.path}">\n${file.content}\n</file>`
    })
    .filter((section) => section.trim().length > 0)
    .join('\n\n')

  const imageScopeReminder = imageFiles.length > 0
    ? resolvedLanguage === 'en'
      ? 'Use only the image attachments listed above as the visual context for this message unless the user explicitly refers to an earlier image.'
      : '이번 메시지에서는 위에 적은 이미지 첨부만 현재 시각 문맥으로 사용하고, 사용자가 명시적으로 말하지 않으면 이전 메시지의 이미지를 기준으로 답하지 마세요.'
    : ''

  const sections = [fileSections, imageScopeReminder, text].filter((section) => section && section.trim().length > 0)
  return sections.join('\n\n')
}

export function toAttachedFiles(files: SelectedFile[]): AttachedFile[] {
  return files.map(({ dataUrl: _dataUrl, ...file }) => ({
    ...file,
    id: file.path,
  }))
}

export function formatAttachedFilesSummary(count: number, language?: AppLanguage) {
  const resolvedLanguage = resolveLanguage(language)
  return `(${translate(resolvedLanguage, 'sessionExport.attachedFiles', { count })})`
}

export function buildAttachmentCopyText(
  text: string,
  attachedFiles: AttachedFile[],
  language?: AppLanguage,
) {
  const sections: string[] = []
  const trimmed = text.trim()
  const resolvedLanguage = resolveLanguage(language)

  if (trimmed) {
    sections.push(trimmed)
  }

  if (attachedFiles.length > 0) {
    sections.push(
      [
        translate(resolvedLanguage, 'sessionExport.attachments'),
        ...attachedFiles.map((file) => `- ${file.name}`),
      ].join('\n'),
    )
  }

  return sections.join('\n\n')
}
