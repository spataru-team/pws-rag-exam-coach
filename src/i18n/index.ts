import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import type { InterfaceLanguage } from '@/types'
import en from './locales/en.json'
import ru from './locales/ru.json'
import ro from './locales/ro.json'

export const SUPPORTED_LANGUAGES: InterfaceLanguage[] = ['en', 'ru', 'ro']

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ru: { translation: ru },
    ro: { translation: ro },
  },
  lng: 'ru',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export function setLanguage(lang: InterfaceLanguage): void {
  void i18n.changeLanguage(lang)
  document.documentElement.lang = lang
}

export default i18n
