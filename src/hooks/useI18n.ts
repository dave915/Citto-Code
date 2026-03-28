import { useCallback } from 'react'
import { translate, type TranslationKey } from '../lib/i18n'
import { useSessionsStore } from '../store/sessions'

export function useI18n() {
  const language = useSessionsStore((state) => state.appLanguage)
  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) => translate(language, key, params),
    [language],
  )

  return {
    language,
    t,
  }
}
