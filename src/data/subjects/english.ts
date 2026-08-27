import type { Subject } from '@/types'

/**
 * English — the second active subject. Vocabulary, grammar, reading
 * comprehension and written answers. Explanations may use Russian as support;
 * English examples must be correct.
 */
export const englishSubject: Subject = {
  id: 'english',
  title: 'English language',
  interfaceTitleByLanguage: {
    en: 'English language',
    ru: 'Английский язык',
    ro: 'Limba engleză',
  },
  learningLanguages: ['en'],
  enabled: true,
  examModeAvailable: true,
  defaultGradeLevel: 9,
  recommendedSessionLengthMin: 20,
  exerciseTypes: [
    {
      id: 'en-mcq',
      subjectId: 'english',
      title: { en: 'Multiple choice', ru: 'Выбор ответа', ro: 'Alegere multiplă' },
      inputMode: 'multiple_choice',
      feedbackMode: 'immediate',
    },
    {
      id: 'en-written',
      subjectId: 'english',
      title: { en: 'Written answer', ru: 'Письменный ответ', ro: 'Răspuns scris' },
      inputMode: 'written',
      feedbackMode: 'rubric_based',
      rubricId: 'en-written-rubric',
    },
    {
      id: 'en-explanation',
      subjectId: 'english',
      title: { en: 'Explain the rule', ru: 'Объясните правило', ro: 'Explică regula' },
      inputMode: 'explanation',
      feedbackMode: 'rubric_based',
      rubricId: 'en-written-rubric',
    },
  ],
  assessmentRubrics: [
    {
      id: 'en-written-rubric',
      subjectId: 'english',
      title: {
        en: 'Written answer rubric',
        ru: 'Рубрика письменного ответа',
        ro: 'Grilă de evaluare a răspunsului scris',
      },
      language: 'en',
      scoringScale: { min: 0, max: 10, label: 'national 0–10' },
      criteria: [
        {
          id: 'content',
          title: { en: 'Content', ru: 'Содержание', ro: 'Conținut' },
          description: {
            en: 'Answer addresses the task and applies the correct rule.',
            ru: 'Ответ соответствует заданию и применяет верное правило.',
            ro: 'Răspunsul corespunde sarcinii și aplică regula corectă.',
          },
          maxPoints: 4,
        },
        {
          id: 'accuracy',
          title: { en: 'Language accuracy', ru: 'Грамотность', ro: 'Corectitudine' },
          description: {
            en: 'Grammar, spelling and word choice are correct.',
            ru: 'Грамматика, орфография и выбор слов верны.',
            ro: 'Gramatica, ortografia și alegerea cuvintelor sunt corecte.',
          },
          maxPoints: 4,
        },
        {
          id: 'fluency',
          title: { en: 'Fluency', ru: 'Связность', ro: 'Fluență' },
          description: {
            en: 'Ideas are connected and easy to follow.',
            ru: 'Мысли связны и легко читаются.',
            ro: 'Ideile sunt conectate și ușor de urmărit.',
          },
          maxPoints: 2,
        },
      ],
    },
  ],
  topicTree: [
    {
      id: 'en-grammar',
      subjectId: 'english',
      title: { en: 'Grammar', ru: 'Грамматика', ro: 'Gramatică' },
      skillArea: 'grammar',
      prerequisites: [],
      difficulty: 'basic',
      gradeLevel: 9,
      examRelevance: 'core',
    },
    {
      id: 'en-vocabulary',
      subjectId: 'english',
      title: { en: 'Vocabulary', ru: 'Лексика', ro: 'Vocabular' },
      skillArea: 'vocabulary',
      prerequisites: [],
      difficulty: 'basic',
      gradeLevel: 9,
      examRelevance: 'medium',
    },
    {
      id: 'en-reading',
      subjectId: 'english',
      title: { en: 'Reading comprehension', ru: 'Понимание текста', ro: 'Înțelegerea textului' },
      skillArea: 'reading',
      prerequisites: [],
      difficulty: 'intermediate',
      gradeLevel: 9,
      examRelevance: 'core',
    },
    {
      id: 'en-writing',
      subjectId: 'english',
      title: { en: 'Writing', ru: 'Письмо', ro: 'Redactare' },
      skillArea: 'writing',
      prerequisites: ['en-grammar', 'en-vocabulary'],
      difficulty: 'intermediate',
      gradeLevel: 9,
      examRelevance: 'high',
    },
  ],
}
