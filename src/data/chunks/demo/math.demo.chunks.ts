import type { ChunkDraft } from '../types'
import { DEMO_SOURCE, DEMO_TEXT_PREFIX } from './types'

const P = DEMO_TEXT_PREFIX

/**
 * Synthetic mathematics demo chunks — generic, widely-known results written from
 * scratch for the reproducibility demo only. Not derived from any textbook.
 * Topic ids and grade levels match `src/data/subjects/math.ts`.
 */
export const mathDemoChunks: ChunkDraft[] = [
  {
    id: 'demo-math-001',
    subjectId: 'math',
    topicId: 'math-real-numbers',
    language: 'ro',
    text: `${P} Numerele raționale se pot scrie ca fracție de două numere întregi, iar numerele iraționale, precum radical din 2 sau pi, nu. Împreună ele formează mulțimea numerelor reale, reprezentate pe axa numerelor.`,
    source: DEMO_SOURCE,
    gradeLevel: 9,
    metadata: { bookId: 'DEMO_SYNTHETIC', chunkId: 'demo_math_001', grade: 9 },
  },
  {
    id: 'demo-math-002',
    subjectId: 'math',
    topicId: 'math-algebraic-expressions',
    language: 'ru',
    text: `${P} Подобные слагаемые имеют одинаковую буквенную часть, и их можно складывать, складывая коэффициенты. Распределительный закон: a(b + c) = ab + ac — используется для раскрытия скобок и вынесения общего множителя.`,
    source: DEMO_SOURCE,
    gradeLevel: 9,
    metadata: { bookId: 'DEMO_SYNTHETIC', chunkId: 'demo_math_002', grade: 9 },
  },
  {
    id: 'demo-math-003',
    subjectId: 'math',
    topicId: 'math-equations-quadratic',
    language: 'ro',
    text: `${P} O ecuație de gradul al doilea ax^2 + bx + c = 0 se rezolvă cu formula x = (-b plus sau minus radical din (b^2 - 4ac)) / (2a). Semnul discriminantului b^2 - 4ac arată câte soluții reale există: două, una sau niciuna.`,
    source: DEMO_SOURCE,
    gradeLevel: 9,
    metadata: { bookId: 'DEMO_SYNTHETIC', chunkId: 'demo_math_003', grade: 9 },
  },
  {
    id: 'demo-math-004',
    subjectId: 'math',
    topicId: 'math-functions',
    language: 'ru',
    text: `${P} Линейная функция имеет вид y = kx + b, где k — угловой коэффициент (наклон прямой), а b — точка пересечения с осью ординат. При k > 0 функция возрастает, при k < 0 — убывает.`,
    source: DEMO_SOURCE,
    gradeLevel: 9,
    metadata: { bookId: 'DEMO_SYNTHETIC', chunkId: 'demo_math_004', grade: 9 },
  },
  {
    id: 'demo-math-005',
    subjectId: 'math',
    topicId: 'math-geometry-circle',
    language: 'ro',
    text: `${P} Lungimea unui cerc de rază r este 2*pi*r, iar aria discului este pi*r^2. Un unghi la centru are măsura egală cu arcul pe care îl subîntinde, iar unghiul înscris are jumătate din această măsură.`,
    source: DEMO_SOURCE,
    gradeLevel: 9,
    metadata: { bookId: 'DEMO_SYNTHETIC', chunkId: 'demo_math_005', grade: 9 },
  },
  {
    id: 'demo-math-006',
    subjectId: 'math',
    topicId: 'math-calculus-applications',
    language: 'ru',
    text: `${P} Производная функции в точке равна угловому коэффициенту касательной и описывает мгновенную скорость изменения величины. Если производная положительна на промежутке, функция возрастает; если отрицательна — убывает.`,
    source: DEMO_SOURCE,
    gradeLevel: 12,
    metadata: { bookId: 'DEMO_SYNTHETIC', chunkId: 'demo_math_006', grade: 12 },
  },
]
