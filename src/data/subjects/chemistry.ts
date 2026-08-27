import type { Subject } from '@/types'

/**
 * Chemistry — grades 9 (foundations) and 12 (BAC, organic chemistry + applied).
 * Content sourced from real Ministry-of-Education textbooks (Химия, 9 и 12
 * класс, Editura ARC) via scripts/ingest-pdf.ts — see corpus/manifest.json.
 * Grounding is critical: never state a formula, reaction, or fact not present
 * in the retrieved context.
 */
export const chemistrySubject: Subject = {
  id: 'chemistry',
  title: 'Chimie',
  interfaceTitleByLanguage: {
    en: 'Chemistry',
    ru: 'Химия',
    ro: 'Chimie',
  },
  learningLanguages: ['ro', 'ru'],
  enabled: true,
  examModeAvailable: true,
  defaultGradeLevel: 9,
  recommendedSessionLengthMin: 20,
  exerciseTypes: [
    {
      id: 'chem-short',
      subjectId: 'chemistry',
      title: { en: 'Short answer', ru: 'Краткий ответ', ro: 'Răspuns scurt' },
      inputMode: 'short_answer',
      feedbackMode: 'immediate',
    },
    {
      id: 'chem-explanation',
      subjectId: 'chemistry',
      title: { en: 'Explain / solve', ru: 'Объяснить / решить', ro: 'Explică / rezolvă' },
      inputMode: 'explanation',
      feedbackMode: 'rubric_based',
      rubricId: 'chem-answer-rubric',
    },
  ],
  assessmentRubrics: [
    {
      id: 'chem-answer-rubric',
      subjectId: 'chemistry',
      title: { en: 'Answer rubric', ru: 'Рубрика ответа', ro: 'Grilă de evaluare' },
      language: 'ru',
      scoringScale: { min: 0, max: 10, label: 'national 0–10' },
      criteria: [
        {
          id: 'factual',
          title: { en: 'Factual accuracy', ru: 'Точность фактов', ro: 'Acuratețe factuală' },
          description: {
            en: 'Formulas, equations and facts match the source material; nothing is invented.',
            ru: 'Формулы, уравнения и факты соответствуют источнику; ничего не выдумано.',
            ro: 'Formulele, ecuațiile și faptele corespund sursei; nimic nu este inventat.',
          },
          maxPoints: 5,
        },
        {
          id: 'method',
          title: { en: 'Method / calculation', ru: 'Метод / расчёт', ro: 'Metodă / calcul' },
          description: {
            en: 'Solution steps are correct and complete (e.g. mole/mass calculations).',
            ru: 'Шаги решения верны и полны (напр. расчёты через количество вещества/массу).',
            ro: 'Pașii de rezolvare sunt corecți și completi.',
          },
          maxPoints: 3,
        },
        {
          id: 'terminology',
          title: { en: 'Terminology', ru: 'Терминология', ro: 'Terminologie' },
          description: {
            en: 'Correct use of chemical terminology and notation.',
            ru: 'Корректное использование химической терминологии и записи.',
            ro: 'Folosirea corectă a terminologiei chimice.',
          },
          maxPoints: 2,
        },
      ],
    },
  ],
  topicTree: [
    {
      id: 'chem-atomic-structure',
      subjectId: 'chemistry',
      title: {
        en: 'Periodic law & atomic structure',
        ru: 'Периодический закон и строение атома',
        ro: 'Legea periodică și structura atomului',
      },
      skillArea: 'theory',
      prerequisites: [],
      difficulty: 'basic',
      gradeLevel: 9,
      examRelevance: 'core',
    },
    {
      id: 'chem-bonding',
      subjectId: 'chemistry',
      title: { en: 'Chemical bonding', ru: 'Химическая связь', ro: 'Legătura chimică' },
      skillArea: 'theory',
      prerequisites: ['chem-atomic-structure'],
      difficulty: 'basic',
      gradeLevel: 9,
      examRelevance: 'high',
    },
    {
      id: 'chem-reactions-basic',
      subjectId: 'chemistry',
      title: {
        en: 'Reaction types & equations',
        ru: 'Типы реакций и уравнения',
        ro: 'Tipuri de reacții și ecuații',
      },
      skillArea: 'reactions',
      prerequisites: ['chem-bonding'],
      difficulty: 'intermediate',
      gradeLevel: 9,
      examRelevance: 'core',
    },
    {
      id: 'chem-metals',
      subjectId: 'chemistry',
      title: {
        en: 'Metals: properties & reactions',
        ru: 'Металлы: свойства и реакции',
        ro: 'Metale: proprietăți și reacții',
      },
      skillArea: 'inorganic',
      prerequisites: ['chem-reactions-basic'],
      difficulty: 'intermediate',
      gradeLevel: 9,
      examRelevance: 'high',
    },
    {
      id: 'chem-nonmetals',
      subjectId: 'chemistry',
      title: {
        en: 'Non-metals (halogens, etc.)',
        ru: 'Неметаллы (галогены и др.)',
        ro: 'Nemetale (halogeni etc.)',
      },
      skillArea: 'inorganic',
      prerequisites: ['chem-reactions-basic'],
      difficulty: 'intermediate',
      gradeLevel: 9,
      examRelevance: 'high',
    },
    {
      id: 'chem-solutions',
      subjectId: 'chemistry',
      title: {
        en: 'Solutions & concentration calculations',
        ru: 'Растворы и расчёт концентраций',
        ro: 'Soluții și calculul concentrațiilor',
      },
      skillArea: 'calculations',
      prerequisites: ['chem-reactions-basic'],
      difficulty: 'intermediate',
      gradeLevel: 9,
      examRelevance: 'core',
    },
    {
      id: 'chem-organic-basics',
      subjectId: 'chemistry',
      title: {
        en: 'Organic chemistry: hydrocarbons',
        ru: 'Органическая химия: углеводороды',
        ro: 'Chimie organică: hidrocarburi',
      },
      skillArea: 'organic',
      prerequisites: ['chem-bonding'],
      difficulty: 'intermediate',
      gradeLevel: 12,
      examRelevance: 'core',
    },
    {
      id: 'chem-organic-functional',
      subjectId: 'chemistry',
      title: {
        en: 'Functional groups (alcohols, acids, esters)',
        ru: 'Функциональные группы (спирты, кислоты, эфиры)',
        ro: 'Grupe funcționale (alcooli, acizi, esteri)',
      },
      skillArea: 'organic',
      prerequisites: ['chem-organic-basics'],
      difficulty: 'advanced',
      gradeLevel: 12,
      examRelevance: 'core',
    },
    {
      id: 'chem-kinetics',
      subjectId: 'chemistry',
      title: {
        en: 'Reaction rate & equilibrium factors',
        ru: 'Скорость реакции и факторы равновесия',
        ro: 'Viteza reacției și factorii echilibrului',
      },
      skillArea: 'physical',
      prerequisites: ['chem-reactions-basic'],
      difficulty: 'advanced',
      gradeLevel: 12,
      examRelevance: 'high',
    },
    {
      id: 'chem-industrial',
      subjectId: 'chemistry',
      title: {
        en: 'Industrial chemistry (metallurgy, refining, glass)',
        ru: 'Промышленная химия (металлургия, нефтепереработка, стекло)',
        ro: 'Chimie industrială (metalurgie, rafinare, sticlă)',
      },
      skillArea: 'applied',
      prerequisites: ['chem-metals'],
      difficulty: 'advanced',
      gradeLevel: 12,
      examRelevance: 'medium',
    },
    {
      id: 'chem-applied-life',
      subjectId: 'chemistry',
      title: {
        en: 'Chemistry & everyday life / safety',
        ru: 'Химия и качество жизни / безопасность',
        ro: 'Chimia și calitatea vieții / siguranța',
      },
      skillArea: 'applied',
      prerequisites: [],
      difficulty: 'basic',
      gradeLevel: 12,
      examRelevance: 'medium',
    },
  ],
  metadata: { supportLanguage: 'ru' },
}
