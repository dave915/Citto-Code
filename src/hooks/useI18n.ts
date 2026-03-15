import { translate, type TranslationKey } from '../lib/i18n'
import { useSessionsStore } from '../store/sessions'

export function useI18n() {
  const language = useSessionsStore((state) => state.appLanguage)

  return {
    language,
    t: (key: TranslationKey, params?: Record<string, string | number>) => translate(language, key, params),
  }
}
