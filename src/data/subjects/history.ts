import type { Subject } from '@/types'

/**
 * History — active subject. Answers must be grounded strictly in retrieved
 * chunks and must never invent dates or events. Content is in RO/RU.
 */
export const historySubject: Subject = {
  id: 'history',
  title: 'Istorie',
  interfaceTitleByLanguage: {
    en: 'History',
    ru: 'История',
    ro: 'Istorie',
  },
  learningLanguages: ['ro', 'ru'],
  enabled: true,
  examModeAvailable: true,
  defaultGradeLevel: 8,
  recommendedSessionLengthMin: 20,
  exerciseTypes: [
    {
      id: 'hist-short',
      subjectId: 'history',
      title: { en: 'Short answer', ru: 'Краткий ответ', ro: 'Răspuns scurt' },
      inputMode: 'short_answer',
      feedbackMode: 'immediate',
    },
    {
      id: 'hist-explanation',
      subjectId: 'history',
      title: { en: 'Explain cause and effect', ru: 'Причина и следствие', ro: 'Cauză și efect' },
      inputMode: 'explanation',
      feedbackMode: 'rubric_based',
      rubricId: 'hist-answer-rubric',
    },
  ],
  assessmentRubrics: [
    {
      id: 'hist-answer-rubric',
      subjectId: 'history',
      title: {
        en: 'Answer rubric',
        ru: 'Рубрика ответа',
        ro: 'Grilă de evaluare',
      },
      language: 'ru',
      scoringScale: { min: 0, max: 10, label: 'national 0–10' },
      criteria: [
        {
          id: 'factual',
          title: { en: 'Factual accuracy', ru: 'Точность фактов', ro: 'Acuratețe factuală' },
          description: {
            en: 'Dates and events match the sources; nothing is invented.',
            ru: 'Даты и события соответствуют источникам; ничего не выдумано.',
            ro: 'Datele și evenimentele corespund surselor; nimic nu este inventat.',
          },
          maxPoints: 5,
        },
        {
          id: 'reasoning',
          title: { en: 'Cause–effect reasoning', ru: 'Причинно-следственная связь', ro: 'Raționament cauză–efect' },
          description: {
            en: 'Explains why events happened, linking causes and consequences.',
            ru: 'Объясняет, почему произошли события, связывая причины и следствия.',
            ro: 'Explică de ce au avut loc evenimentele, legând cauze și consecințe.',
          },
          maxPoints: 3,
        },
        {
          id: 'terms',
          title: { en: 'Use of terms', ru: 'Использование терминов', ro: 'Folosirea termenilor' },
          description: {
            en: 'Correct use of historical terms and sources.',
            ru: 'Корректное использование исторических терминов и источников.',
            ro: 'Folosirea corectă a termenilor istorici și a surselor.',
          },
          maxPoints: 2,
        },
      ],
    },
  ],
  topicTree: [
    {
      id: 'hist-chronology',
      subjectId: 'history',
      title: { en: 'Chronology', ru: 'Хронология', ro: 'Cronologie' },
      skillArea: 'chronology',
      prerequisites: [],
      difficulty: 'basic',
      gradeLevel: 8,
      examRelevance: 'core',
    },
    {
      id: 'hist-sources',
      subjectId: 'history',
      title: {
        en: 'Sources and cause–effect',
        ru: 'Источники и причинность',
        ro: 'Surse și cauzalitate',
      },
      skillArea: 'analysis',
      prerequisites: ['hist-chronology'],
      difficulty: 'intermediate',
      gradeLevel: 8,
      examRelevance: 'high',
    },
    {
      id: 'hist-terms',
      subjectId: 'history',
      title: { en: 'Historical terms', ru: 'Исторические термины', ro: 'Termeni istorici' },
      skillArea: 'terminology',
      prerequisites: [],
      difficulty: 'basic',
      gradeLevel: 8,
      examRelevance: 'medium',
    },
  ],
}
