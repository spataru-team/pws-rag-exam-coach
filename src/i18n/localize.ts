import type { InterfaceLanguage, LocalizedText } from '@/types'

/** Picks a localized string, falling back to English then any available value. */
export function localize(
  text: LocalizedText | Partial<Record<InterfaceLanguage, string>> | undefined,
  lang: InterfaceLanguage,
): string {
  if (!text) return ''
  return text[lang] ?? text.en ?? Object.values(text)[0] ?? ''
}
