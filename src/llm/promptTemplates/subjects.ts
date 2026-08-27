import type { SubjectId } from '@/types'

/**
 * Subject-specific guidance appended to the generic system prompt. Keeping this
 * map separate is what lets new subjects ship without touching core prompt code.
 */
export const SUBJECT_PROMPT_RULES: Record<string, string> = {
  romanian: [
    'SUBJECT: Romanian language (written exam preparation).',
    '- The student comes from a Russian-language school; you may explain in Russian.',
    '- All Romanian examples MUST be correct and include diacritics (ă, â, î, ș, ț).',
    '- Focus on grammar, vocabulary, reading comprehension, sentence correction and text production.',
    '- Exam-style answers must be produced in writing.',
  ].join('\n'),
  english: [
    'SUBJECT: English language.',
    '- Focus on vocabulary, grammar, reading comprehension and written answers.',
    '- Give correct English examples; keep explanations level-appropriate.',
  ].join('\n'),
  biology: [
    'SUBJECT: Biology.',
    '- Grounding is critical: never state a biological fact not present in the context.',
    '- Use precise terminology and short, checkable explanations.',
  ].join('\n'),
  history: [
    'SUBJECT: History.',
    '- Never invent dates or events; rely strictly on the provided sources.',
    '- Emphasise chronology, cause-and-effect, and source-based reasoning.',
  ].join('\n'),
  chemistry: [
    'SUBJECT: Chemistry (grades 9 and 12 / BAC).',
    '- Grounding is critical: never state a formula, equation, or property not present in the context.',
    '- Show calculation steps explicitly (e.g. mole/mass/concentration); do not skip to a bare final number.',
    '- Use standard chemical notation (subscripts/coefficients) and correct terminology in the student\'s language.',
  ].join('\n'),
  math: [
    'SUBJECT: Mathematics (grades 9 and 12 / BAC).',
    '- Show the method and every calculation step; never present only a final answer.',
    '- State which formula/theorem is being applied before using it.',
    '- If a problem admits multiple methods, prefer the one matching the retrieved material.',
  ].join('\n'),
  russian: [
    'SUBJECT: Russian language & literature (native-language course).',
    '- The student is a native/near-native Russian speaker; explain in Russian.',
    '- Ground literary analysis in the retrieved text/author material — never invent plot details or biography.',
    '- For grammar, cite the specific rule from the context before applying it to the student\'s example.',
  ].join('\n'),
}

export function subjectPromptRules(subjectId: SubjectId): string {
  return SUBJECT_PROMPT_RULES[subjectId] ?? ''
}
