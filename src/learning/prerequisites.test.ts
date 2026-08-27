import { describe, it, expect } from 'vitest'
import { prerequisiteChain } from './prerequisites'
import type { Topic } from '@/types'

function t(id: string, prerequisites: string[] = []): Topic {
  return {
    id,
    subjectId: 'chemistry',
    title: { en: id },
    skillArea: 'test',
    prerequisites,
    difficulty: 'basic',
    gradeLevel: 9,
    examRelevance: 'medium',
  }
}

describe('prerequisiteChain', () => {
  it('returns direct prerequisites at depth 1', () => {
    const topics = [t('mole-calc', ['atomic-structure']), t('atomic-structure')]
    const chain = prerequisiteChain(topics, 'mole-calc')
    expect(chain).toEqual([{ topicId: 'atomic-structure', depth: 1 }])
  })

  it('walks multiple hops, nearest first', () => {
    const topics = [t('c', ['b']), t('b', ['a']), t('a')]
    const chain = prerequisiteChain(topics, 'c')
    expect(chain).toEqual([
      { topicId: 'b', depth: 1 },
      { topicId: 'a', depth: 2 },
    ])
  })

  it('deduplicates a prerequisite reachable via two paths', () => {
    const topics = [t('d', ['b', 'c']), t('b', ['a']), t('c', ['a']), t('a')]
    const chain = prerequisiteChain(topics, 'd')
    const ids = chain.map((s) => s.topicId)
    expect(ids.filter((id) => id === 'a')).toHaveLength(1)
  })

  it('is cycle-safe', () => {
    const topics = [t('x', ['y']), t('y', ['x'])]
    expect(() => prerequisiteChain(topics, 'x')).not.toThrow()
    const chain = prerequisiteChain(topics, 'x')
    expect(chain).toEqual([{ topicId: 'y', depth: 1 }])
  })

  it('respects maxDepth', () => {
    const topics = [t('c', ['b']), t('b', ['a']), t('a')]
    const chain = prerequisiteChain(topics, 'c', 1)
    expect(chain).toEqual([{ topicId: 'b', depth: 1 }])
  })

  it('returns an empty chain for a topic with no prerequisites', () => {
    const topics = [t('standalone')]
    expect(prerequisiteChain(topics, 'standalone')).toEqual([])
  })

  it('skips a dangling prerequisite id that has no matching topic', () => {
    const topics = [t('a', ['missing'])]
    expect(prerequisiteChain(topics, 'a')).toEqual([])
  })
})
