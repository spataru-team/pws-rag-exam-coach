import type { Subject } from '@/types'

/**
 * Russian language & literature — the native-language course for students
 * from Russian-medium schools (distinct from Romanian schools' "Russian as a
 * foreign language" course — see scripts/fetch-textbooks.ts SUBJECT_ALIASES
 * for the source distinction). Grade 12 (BAC) content is sourced from a real
 * Ministry-of-Education textbook via scripts/ingest-pdf.ts; no grade-9 book
 * was available in the source archive (corpus/manifest.json — gap between
 * grades 7 and 10/11/12), so the grade-9 topic tree entries are authored
 * directly from the ANCE Evaluarea Națională programme structure rather than
 * PDF-extracted, same as the project's other hand-curated subjects.
 */
export const russianSubject: Subject = {
  id: 'russian',
  title: 'Русский язык и литература',
  interfaceTitleByLanguage: {
    en: 'Russian language & literature',
    ru: 'Русский язык и литература',
    ro: 'Limba și literatura rusă',
  },
  learningLanguages: ['ru'],
  enabled: true,
  examModeAvailable: true,
  defaultGradeLevel: 9,
  recommendedSessionLengthMin: 25,
  exerciseTypes: [
    {
      id: 'rus-written',
      subjectId: 'russian',
      title: { en: 'Written answer', ru: 'Письменный ответ', ro: 'Răspuns scris' },
      inputMode: 'written',
      feedbackMode: 'rubric_based',
      rubricId: 'rus-written-rubric',
    },
    {
      id: 'rus-explanation',
      subjectId: 'russian',
      title: { en: 'Explain the rule', ru: 'Объясните правило', ro: 'Explică regula' },
      inputMode: 'explanation',
      feedbackMode: 'rubric_based',
      rubricId: 'rus-written-rubric',
    },
  ],
  assessmentRubrics: [
    {
      id: 'rus-written-rubric',
      subjectId: 'russian',
      title: { en: 'Written answer rubric', ru: 'Рубрика письменного ответа', ro: 'Grilă de evaluare a răspunsului scris' },
      language: 'ru',
      scoringScale: { min: 0, max: 10, label: 'national 0–10' },
      criteria: [
        {
          id: 'content',
          title: { en: 'Content', ru: 'Содержание', ro: 'Conținut' },
          description: {
            en: 'Answer addresses the task and is grounded in the text/rule.',
            ru: 'Ответ соответствует заданию и опирается на текст/правило.',
            ro: 'Răspunsul corespunde sarcinii și se bazează pe text/regulă.',
          },
          maxPoints: 4,
        },
        {
          id: 'correctness',
          title: { en: 'Language correctness', ru: 'Грамотность', ro: 'Corectitudine' },
          description: {
            en: 'Spelling, grammar and punctuation are correct.',
            ru: 'Орфография, грамматика и пунктуация верны.',
            ro: 'Ortografia, gramatica și punctuația sunt corecte.',
          },
          maxPoints: 4,
        },
        {
          id: 'structure',
          title: { en: 'Structure', ru: 'Структура', ro: 'Structură' },
          description: {
            en: 'Answer is clearly organised (argument/example/conclusion).',
            ru: 'Ответ ясно организован (тезис/аргумент/пример/вывод).',
            ro: 'Răspunsul este organizat clar.',
          },
          maxPoints: 2,
        },
      ],
    },
  ],
  topicTree: [
    {
      id: 'rus-grammar-review',
      subjectId: 'russian',
      title: { en: 'Grammar & language system review', ru: 'Повторение грамматики', ro: 'Recapitularea gramaticii' },
      skillArea: 'grammar',
      prerequisites: [],
      difficulty: 'basic',
      gradeLevel: 9,
      examRelevance: 'core',
    },
    {
      id: 'rus-reading-comprehension',
      subjectId: 'russian',
      title: { en: 'Reading comprehension', ru: 'Понимание текста', ro: 'Înțelegerea textului' },
      skillArea: 'reading',
      prerequisites: [],
      difficulty: 'basic',
      gradeLevel: 9,
      examRelevance: 'core',
    },
    {
      id: 'rus-written-expression',
      subjectId: 'russian',
      title: { en: 'Written expression (short answer/essay)', ru: 'Письменная речь (ответ/сочинение)', ro: 'Exprimarea scrisă' },
      skillArea: 'writing',
      prerequisites: ['rus-grammar-review'],
      difficulty: 'intermediate',
      gradeLevel: 9,
      examRelevance: 'high',
    },
    {
      id: 'rus-literature-20th-century',
      subjectId: 'russian',
      title: {
        en: 'Early 20th-century Russian literature',
        ru: 'Русская литература первой половины XX века',
        ro: 'Literatura rusă din prima jumătate a sec. XX',
      },
      skillArea: 'literature',
      prerequisites: [],
      difficulty: 'intermediate',
      gradeLevel: 12,
      examRelevance: 'core',
    },
    {
      id: 'rus-literary-analysis',
      subjectId: 'russian',
      title: {
        en: 'Literary analysis (characters, devices)',
        ru: 'Анализ художественного текста (герои, приёмы)',
        ro: 'Analiza textului literar (personaje, procedee)',
      },
      skillArea: 'literature',
      prerequisites: ['rus-literature-20th-century'],
      difficulty: 'intermediate',
      gradeLevel: 12,
      examRelevance: 'core',
    },
    {
      id: 'rus-essay-writing',
      subjectId: 'russian',
      title: {
        en: 'Argumentative essay on a literary topic',
        ru: 'Сочинение-рассуждение на литературную тему',
        ro: 'Eseu argumentativ pe o temă literară',
      },
      skillArea: 'writing',
      prerequisites: ['rus-literary-analysis'],
      difficulty: 'advanced',
      gradeLevel: 12,
      examRelevance: 'core',
    },
    {
      id: 'rus-poetry-analysis',
      subjectId: 'russian',
      title: { en: 'Poetry analysis', ru: 'Анализ поэтического текста', ro: 'Analiza textului poetic' },
      skillArea: 'literature',
      prerequisites: ['rus-literary-analysis'],
      difficulty: 'advanced',
      gradeLevel: 12,
      examRelevance: 'medium',
    },
  ],
  metadata: { supportLanguage: 'ru' },
}
