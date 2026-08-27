/** Random, non-identifying id with a prefix. Kept out of components so the
 * React purity lint rules don't flag impure calls during render. */
export function newId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  return `${prefix}_${rand}`
}

export function nowIso(): string {
  return new Date().toISOString()
}
