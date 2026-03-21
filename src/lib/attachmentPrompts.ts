import type { SelectedFile } from '../../electron/preload'
import type { AppLanguage } from './i18n'
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
) {
  if (files.length === 0) return text

  const resolvedLanguage = resolveLanguage(language)
  const fileSections = files
    .map((file) => {
      if (file.fileType === 'image') {
        return `<file path="${file.path}" type="image">\n[${resolvedLanguage === 'en' ? 'Image file' : '이미지 파일'}: ${file.name} (${file.size} bytes) - ${resolvedLanguage === 'en' ? 'check it directly from the path' : '경로에서 직접 확인하세요'}]\n</file>`
      }

      return `<file path="${file.path}">\n${file.content}\n</file>`
    })
    .join('\n\n')

  return text
    ? `${fileSections}\n\n${text}`
    : fileSections
}

export function toAttachedFiles(files: SelectedFile[]): AttachedFile[] {
  return files.map(({ dataUrl: _dataUrl, ...file }) => ({
    ...file,
    id: file.path,
  }))
}

export function formatAttachedFilesSummary(count: number, language?: AppLanguage) {
  const resolvedLanguage = resolveLanguage(language)
  return resolvedLanguage === 'en'
    ? `(${count} attached files)`
    : `(파일 ${count}개 첨부)`
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
        resolvedLanguage === 'en' ? 'Attached files' : '첨부 파일',
        ...attachedFiles.map((file) => `- ${file.name}`),
      ].join('\n'),
    )
  }

  return sections.join('\n\n')
}
