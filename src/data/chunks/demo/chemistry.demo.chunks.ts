import type { ChunkDraft } from '../types'
import { DEMO_SOURCE, DEMO_TEXT_PREFIX } from './types'

const P = DEMO_TEXT_PREFIX

/**
 * Synthetic chemistry demo chunks — generic, widely-known concepts written from
 * scratch for the reproducibility demo only. Not derived from any textbook.
 * Topic ids and grade levels match `src/data/subjects/chemistry.ts`.
 */
export const chemistryDemoChunks: ChunkDraft[] = [
  {
    id: 'demo-chem-001',
    subjectId: 'chemistry',
    topicId: 'chem-atomic-structure',
    language: 'ru',
    text: `${P} Атом состоит из ядра (протоны и нейтроны) и электронов на оболочках. Число протонов равно порядковому номеру элемента и определяет его химические свойства. Атомы одного элемента с разным числом нейтронов называются изотопами.`,
    source: DEMO_SOURCE,
    gradeLevel: 9,
    metadata: { bookId: 'DEMO_SYNTHETIC', chunkId: 'demo_chem_001', grade: 9 },
  },
  {
    id: 'demo-chem-002',
    subjectId: 'chemistry',
    topicId: 'chem-bonding',
    language: 'ro',
    text: `${P} Legătura ionică se formează prin transfer de electroni între un metal și un nemetal, rezultând ioni de sarcini opuse care se atrag. Legătura covalentă se formează prin punerea în comun a perechilor de electroni între nemetale.`,
    source: DEMO_SOURCE,
    gradeLevel: 9,
    metadata: { bookId: 'DEMO_SYNTHETIC', chunkId: 'demo_chem_002', grade: 9 },
  },
  {
    id: 'demo-chem-003',
    subjectId: 'chemistry',
    topicId: 'chem-reactions-basic',
    language: 'ru',
    text: `${P} В химической реакции масса сохраняется: число атомов каждого элемента в левой и правой части уравнения одинаково. Поэтому уравнение реакции уравнивают, подбирая коэффициенты перед формулами веществ, не меняя сами формулы.`,
    source: DEMO_SOURCE,
    gradeLevel: 9,
    metadata: { bookId: 'DEMO_SYNTHETIC', chunkId: 'demo_chem_003', grade: 9 },
  },
  {
    id: 'demo-chem-004',
    subjectId: 'chemistry',
    topicId: 'chem-solutions',
    language: 'ro',
    text: `${P} Concentrația unei soluții arată cât dizolvat se află într-o cantitate dată de soluție, de exemplu ca procent de masă. Solubilitatea majorității solidelor crește cu temperatura, iar a gazelor scade când temperatura crește.`,
    source: DEMO_SOURCE,
    gradeLevel: 9,
    metadata: { bookId: 'DEMO_SYNTHETIC', chunkId: 'demo_chem_004', grade: 9 },
  },
  {
    id: 'demo-chem-005',
    subjectId: 'chemistry',
    topicId: 'chem-organic-functional',
    language: 'ru',
    text: `${P} Функциональная группа — это атом или группа атомов, определяющая свойства органического вещества. Гидроксильная группа –OH характерна для спиртов, карбоксильная группа –COOH — для карбоновых кислот.`,
    source: DEMO_SOURCE,
    gradeLevel: 12,
    metadata: { bookId: 'DEMO_SYNTHETIC', chunkId: 'demo_chem_005', grade: 12 },
  },
  {
    id: 'demo-chem-006',
    subjectId: 'chemistry',
    topicId: 'chem-kinetics',
    language: 'ro',
    text: `${P} Viteza unei reacții chimice crește de obicei cu temperatura, cu concentrația reactanților și cu suprafața de contact, iar un catalizator o mărește fără a se consuma în reacție.`,
    source: DEMO_SOURCE,
    gradeLevel: 12,
    metadata: { bookId: 'DEMO_SYNTHETIC', chunkId: 'demo_chem_006', grade: 12 },
  },
]
