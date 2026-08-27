import type { ThemeMode } from '@/types'

/** Applies theme and dyslexia mode to the document root via data attributes. */
export function applyAppearance(theme: ThemeMode, dyslexia: boolean): void {
  const root = document.documentElement
  root.dataset.theme = theme
  root.dataset.dyslexia = String(dyslexia)
}
