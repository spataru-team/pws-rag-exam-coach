import type { ChunkDraft } from '../types'
import { DEMO_SOURCE, DEMO_TEXT_PREFIX } from './types'

const P = DEMO_TEXT_PREFIX

/**
 * Synthetic Russian-language & literature demo chunks — generic study concepts
 * written from scratch for the reproducibility demo only. Not derived from any
 * textbook or exam. Topic ids and grade levels match
 * `src/data/subjects/russian.ts`.
 */
export const russianDemoChunks: ChunkDraft[] = [
  {
    id: 'demo-rus-001',
    subjectId: 'russian',
    topicId: 'rus-grammar-review',
    language: 'ru',
    text: `${P} Самостоятельные части речи называют предметы, признаки и действия: существительное, прилагательное, глагол, наречие, местоимение, числительное. Служебные части речи — предлог, союз, частица — связывают слова и предложения.`,
    source: DEMO_SOURCE,
    gradeLevel: 9,
    metadata: { bookId: 'DEMO_SYNTHETIC', chunkId: 'demo_rus_001', grade: 9 },
  },
  {
    id: 'demo-rus-002',
    subjectId: 'russian',
    topicId: 'rus-reading-comprehension',
    language: 'ru',
    text: `${P} Чтобы понять текст, сначала находят основную мысль (о чём текст в целом), затем отделяют её от второстепенных деталей и примеров. Значение незнакомого слова часто можно определить по контексту соседних предложений.`,
    source: DEMO_SOURCE,
    gradeLevel: 9,
    metadata: { bookId: 'DEMO_SYNTHETIC', chunkId: 'demo_rus_002', grade: 9 },
  },
  {
    id: 'demo-rus-003',
    subjectId: 'russian',
    topicId: 'rus-written-expression',
    language: 'ru',
    text: `${P} Абзац строится вокруг одной мысли: первое предложение вводит её, следующие раскрывают и подтверждают примерами, последнее подводит итог. Связность обеспечивают слова-связки: во-первых, поэтому, однако, наконец.`,
    source: DEMO_SOURCE,
    gradeLevel: 9,
    metadata: { bookId: 'DEMO_SYNTHETIC', chunkId: 'demo_rus_003', grade: 9 },
  },
  {
    id: 'demo-rus-004',
    subjectId: 'russian',
    topicId: 'rus-literary-analysis',
    language: 'ru',
    text: `${P} При анализе художественного произведения различают тему (о чём оно), идею (что автор хочет сказать), сюжет (последовательность событий) и композицию (как части текста расположены). Характер героя раскрывается через поступки, речь и отношение других персонажей.`,
    source: DEMO_SOURCE,
    gradeLevel: 12,
    metadata: { bookId: 'DEMO_SYNTHETIC', chunkId: 'demo_rus_004', grade: 12 },
  },
  {
    id: 'demo-rus-005',
    subjectId: 'russian',
    topicId: 'rus-essay-writing',
    language: 'ru',
    text: `${P} Сочинение-рассуждение состоит из тезиса (главная мысль), аргументов с примерами и вывода, который повторяет тезис другими словами. Каждый аргумент лучше выносить в отдельный абзац.`,
    source: DEMO_SOURCE,
    gradeLevel: 12,
    metadata: { bookId: 'DEMO_SYNTHETIC', chunkId: 'demo_rus_005', grade: 12 },
  },
  {
    id: 'demo-rus-006',
    subjectId: 'russian',
    topicId: 'rus-poetry-analysis',
    language: 'ru',
    text: `${P} При разборе стихотворения обращают внимание на размер (ямб, хорей и другие), рифму и строфику, а также на образные средства — эпитет, метафору, сравнение, олицетворение — и на то, какое настроение они создают.`,
    source: DEMO_SOURCE,
    gradeLevel: 12,
    metadata: { bookId: 'DEMO_SYNTHETIC', chunkId: 'demo_rus_006', grade: 12 },
  },
]
