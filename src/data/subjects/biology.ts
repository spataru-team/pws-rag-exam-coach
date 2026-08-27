import type { Subject } from '@/types'

/**
 * Biology — active subject. Grounding is critical: answers must rely strictly on
 * retrieved chunks and never invent biological facts. Content is in RO/RU.
 */
export const biologySubject: Subject = {
  id: 'biology',
  title: 'Biologie',
  interfaceTitleByLanguage: {
    en: 'Biology',
    ru: 'Биология',
    ro: 'Biologie',
  },
  learningLanguages: ['ro', 'ru'],
  enabled: true,
  examModeAvailable: true,
  defaultGradeLevel: 7,
  recommendedSessionLengthMin: 20,
  exerciseTypes: [
    {
      id: 'bio-short',
      subjectId: 'biology',
      title: { en: 'Short answer', ru: 'Краткий ответ', ro: 'Răspuns scurt' },
      inputMode: 'short_answer',
      feedbackMode: 'immediate',
    },
    {
      id: 'bio-concept',
      subjectId: 'biology',
      title: { en: 'Concept check', ru: 'Проверка понятия', ro: 'Verificarea conceptului' },
      inputMode: 'explanation',
      feedbackMode: 'rubric_based',
      rubricId: 'bio-answer-rubric',
    },
  ],
  assessmentRubrics: [
    {
      id: 'bio-answer-rubric',
      subjectId: 'biology',
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
            en: 'Statements match the source material; nothing is invented.',
            ru: 'Утверждения соответствуют источнику; ничего не выдумано.',
            ro: 'Afirmațiile corespund sursei; nimic nu este inventat.',
          },
          maxPoints: 5,
        },
        {
          id: 'terminology',
          title: { en: 'Terminology', ru: 'Терминология', ro: 'Terminologie' },
          description: {
            en: 'Correct use of biological terms.',
            ru: 'Корректное использование биологических терминов.',
            ro: 'Folosirea corectă a termenilor biologici.',
          },
          maxPoints: 3,
        },
        {
          id: 'clarity',
          title: { en: 'Clarity', ru: 'Ясность', ro: 'Claritate' },
          description: {
            en: 'The explanation is clear and to the point.',
            ru: 'Объяснение ясное и по существу.',
            ro: 'Explicația este clară și la obiect.',
          },
          maxPoints: 2,
        },
      ],
    },
  ],
  topicTree: [
    {
      id: 'bio-cell',
      subjectId: 'biology',
      title: { en: 'The cell', ru: 'Клетка', ro: 'Celula' },
      skillArea: 'cytology',
      prerequisites: [],
      difficulty: 'basic',
      gradeLevel: 7,
      examRelevance: 'core',
    },
    {
      id: 'bio-organism-levels',
      subjectId: 'biology',
      title: {
        en: 'Levels of organisation',
        ru: 'Уровни организации',
        ro: 'Niveluri de organizare',
      },
      skillArea: 'organisation',
      prerequisites: ['bio-cell'],
      difficulty: 'basic',
      gradeLevel: 7,
      examRelevance: 'high',
    },
    {
      id: 'bio-terminology',
      subjectId: 'biology',
      title: { en: 'Terminology', ru: 'Терминология', ro: 'Terminologie' },
      skillArea: 'terminology',
      prerequisites: [],
      difficulty: 'basic',
      gradeLevel: 7,
      examRelevance: 'medium',
    },
  ],
}
