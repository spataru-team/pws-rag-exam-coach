import type { Topic } from '@/types'

export interface PrerequisiteStep {
  topicId: string
  /** Hop distance from the target topic — 1 = a direct prerequisite. */
  depth: number
}

/**
 * Walks Topic.prerequisites upward from `topicId` (breadth-first), returning
 * the chain of foundational topics a student should review first — nearest
 * prerequisite first, deduplicated, cycle-safe, capped at `maxDepth` hops.
 *
 * This is the "concept graph" the coach explains failures with: a wrong
 * answer on a topic whose prerequisite chain includes an unmastered topic
 * isn't just "wrong" — it's "wrong because X was never solid", which is a
 * pedagogically different (and more useful) thing to tell the student than
 * re-explaining the topic they just failed. The graph itself needs no
 * building: every subject's topicTree already declares real prerequisites
 * (src/data/subjects/*.ts), so this is a pure traversal over existing data.
 */
export function prerequisiteChain(topics: Topic[], topicId: string, maxDepth = 3): PrerequisiteStep[] {
  const byId = new Map(topics.map((t) => [t.id, t]))
  const visited = new Set<string>([topicId])
  const chain: PrerequisiteStep[] = []

  let frontier = [topicId]
  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
    const next: string[] = []
    for (const id of frontier) {
      const topic = byId.get(id)
      if (!topic) continue
      for (const prereqId of topic.prerequisites) {
        if (visited.has(prereqId)) continue
        visited.add(prereqId)
        // A dangling id (authoring bug — declared as a prerequisite but no such
        // topic exists) has nothing to show the student, so it's dropped here
        // rather than surfaced as an unresolvable step.
        if (!byId.has(prereqId)) continue
        chain.push({ topicId: prereqId, depth })
        next.push(prereqId)
      }
    }
    frontier = next
  }
  return chain
}
