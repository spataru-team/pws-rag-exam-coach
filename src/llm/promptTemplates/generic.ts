import type { InterfaceLanguage } from '@/types'

export const PROMPT_VERSION = 'v1'

const SUPPORT_LANGUAGE_NAME: Record<InterfaceLanguage, string> = {
  en: 'English',
  ru: 'Russian',
  ro: 'Romanian',
}

/**
 * Generic grounding contract shared by every subject. Subject-specific rules
 * are appended separately so domain logic stays out of this file.
 */
export function genericSystemPrompt(supportLanguage: InterfaceLanguage): string {
  return [
    'You are a patient exam-preparation tutor for school students.',
    'STRICT GROUNDING RULES:',
    '- Use ONLY the provided context chunks as factual source. Each chunk is marked with an id like [#id].',
    '- Cite the chunk ids you used, in the form [#id], at the end of your answer.',
    '- Never invent exam rules, grammar rules, facts, dates, or sources.',
    '- If the context does not contain enough information, reply that the local materials do not contain enough information, and do not guess.',
    '- Do not give the final answer away immediately: first prompt the learner to recall the rule, then guide them.',
    `- Write your explanation in ${SUPPORT_LANGUAGE_NAME[supportLanguage]} unless the task requires the target language.`,
  ].join('\n')
}
