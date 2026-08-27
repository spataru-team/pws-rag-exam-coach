import { describe, it, expect } from 'vitest'
import {
  boxArea,
  clusterBoxes,
  distance,
  expand,
  filterMaxSize,
  filterMinSize,
  intersection,
  intersects,
  isPageFrame,
  looksLikeBodyText,
  overlapRatio,
  textCoverageRatio,
  union,
  type Box,
} from './figureLayout'

describe('intersects/intersection', () => {
  it('detects overlapping boxes', () => {
    expect(intersects([0, 0, 10, 10], [5, 5, 15, 15])).toBe(true)
    expect(intersection([0, 0, 10, 10], [5, 5, 15, 15])).toEqual([5, 5, 10, 10])
  })

  it('treats touching edges as non-overlapping', () => {
    expect(intersects([0, 0, 10, 10], [10, 0, 20, 10])).toBe(false)
    expect(intersection([0, 0, 10, 10], [10, 0, 20, 10])).toBeUndefined()
  })

  it('returns false/undefined for disjoint boxes', () => {
    expect(intersects([0, 0, 10, 10], [20, 20, 30, 30])).toBe(false)
    expect(intersection([0, 0, 10, 10], [20, 20, 30, 30])).toBeUndefined()
  })
})

describe('union/expand/area', () => {
  it('unions to the bounding box of both', () => {
    expect(union([0, 0, 10, 10], [5, 8, 20, 12])).toEqual([0, 0, 20, 12])
  })

  it('expand grows every edge by margin', () => {
    expect(expand([10, 10, 20, 20], 2)).toEqual([8, 8, 22, 22])
  })

  it('area is width * height, 0 for degenerate boxes', () => {
    expect(boxArea([0, 0, 10, 4])).toBe(40)
    expect(boxArea([10, 0, 5, 4])).toBe(0) // inverted (xMax < xMin)
  })
})

describe('distance', () => {
  it('is 0 for overlapping or touching boxes', () => {
    expect(distance([0, 0, 10, 10], [5, 5, 15, 15])).toBe(0)
    expect(distance([0, 0, 10, 10], [10, 0, 20, 10])).toBe(0)
  })

  it('is the gap along the axis they are separated on', () => {
    expect(distance([0, 0, 10, 10], [15, 0, 25, 10])).toBe(5) // horizontal gap
    expect(distance([0, 0, 10, 10], [0, 15, 10, 25])).toBe(5) // vertical gap
  })

  it('is the larger gap when separated diagonally', () => {
    // horizontal gap 5, vertical gap 20 -> Chebyshev-style max
    expect(distance([0, 0, 10, 10], [15, 30, 25, 40])).toBe(20)
  })
})

describe('overlapRatio / textCoverageRatio', () => {
  it('overlapRatio is fraction of `a` covered by `b` (asymmetric)', () => {
    // b fully contains a's right half: overlap area 50 / area(a)=100 -> 0.5
    expect(overlapRatio([0, 0, 10, 10], [5, 0, 20, 10])).toBeCloseTo(0.5, 6)
    // from b's perspective the same overlap is a much smaller fraction of b
    expect(overlapRatio([5, 0, 20, 10], [0, 0, 10, 10])).toBeCloseTo(50 / 150, 6)
  })

  it('textCoverageRatio sums overlaps and caps at 1', () => {
    const box: Box = [0, 0, 10, 10]
    expect(textCoverageRatio(box, [[0, 0, 5, 10]])).toBeCloseTo(0.5, 6)
    // two overlapping text boxes covering the whole box, double counted but capped
    expect(textCoverageRatio(box, [[0, 0, 10, 10], [0, 0, 10, 10]])).toBe(1)
    expect(textCoverageRatio(box, [])).toBe(0)
  })
})

describe('isPageFrame', () => {
  const page: Box = [0, 0, 600, 800]

  it('flags a box covering most of the page as a frame/border', () => {
    expect(isPageFrame([10, 10, 590, 790], page)).toBe(true)
  })

  it('flags a full-width thin box as a horizontal rule', () => {
    expect(isPageFrame([0, 400, 600, 401.5], page)).toBe(true)
  })

  it('flags a full-height thin box as a vertical rule', () => {
    expect(isPageFrame([300, 0, 301, 800], page)).toBe(true)
  })

  it('does not flag a normal figure-sized box', () => {
    expect(isPageFrame([100, 100, 300, 250], page)).toBe(false)
  })

  it('does not flag a wide-but-thick box as a rule', () => {
    expect(isPageFrame([0, 400, 600, 460], page)).toBe(false)
  })
})

describe('clusterBoxes', () => {
  it('merges boxes within gap into one', () => {
    const boxes: Box[] = [
      [0, 0, 10, 10],
      [12, 0, 22, 10], // 2pt away from the first
    ]
    expect(clusterBoxes(boxes, 5)).toEqual([[0, 0, 22, 10]])
  })

  it('leaves far-apart boxes separate', () => {
    const boxes: Box[] = [
      [0, 0, 10, 10],
      [100, 100, 110, 110],
    ]
    const result = clusterBoxes(boxes, 5)
    expect(result).toHaveLength(2)
  })

  it('chains merges transitively (A~B, B~C but A not~C directly)', () => {
    const boxes: Box[] = [
      [0, 0, 10, 10],
      [11, 0, 21, 10], // 1pt from A
      [23, 0, 33, 10], // 2pt from B, but 13pt from A directly
    ]
    const result = clusterBoxes(boxes, 3)
    expect(result).toEqual([[0, 0, 33, 10]])
  })

  it('is a no-op on a single box and empty input', () => {
    expect(clusterBoxes([[1, 2, 3, 4]], 5)).toEqual([[1, 2, 3, 4]])
    expect(clusterBoxes([], 5)).toEqual([])
  })
})

describe('filterMinSize', () => {
  it('drops boxes below either minimum dimension', () => {
    const boxes: Box[] = [
      [0, 0, 40, 40], // keep
      [0, 0, 5, 40], // too narrow
      [0, 0, 40, 5], // too short
    ]
    expect(filterMinSize(boxes, 10, 10)).toEqual([[0, 0, 40, 40]])
  })
})

describe('filterMaxSize', () => {
  it('drops boxes above the maximum on either dimension', () => {
    const boxes: Box[] = [
      [0, 0, 100, 80], // keep
      [0, 0, 300, 80], // too wide (e.g. an exam answer-cell rectangle)
      [0, 0, 100, 300], // too tall
    ]
    expect(filterMaxSize(boxes, 200, 200)).toEqual([[0, 0, 100, 80]])
  })
})

describe('looksLikeBodyText', () => {
  it('flags a box densely packed with many small text boxes', () => {
    const box: Box = [0, 0, 100, 20]
    // 10 word-boxes tiling most of the width
    const words: Box[] = Array.from({ length: 10 }, (_, i) => [i * 10, 0, i * 10 + 9, 20] as Box)
    expect(looksLikeBodyText(box, words)).toBe(true)
  })

  it('does not flag a diagram with only a couple of numeric labels', () => {
    const box: Box = [0, 0, 100, 100]
    const labels: Box[] = [
      [10, 10, 25, 20], // "6 cm"
      [60, 60, 78, 70], // "100 cm"
    ]
    expect(looksLikeBodyText(box, labels)).toBe(false)
  })

  it('does not flag a box with no overlapping text', () => {
    expect(looksLikeBodyText([0, 0, 100, 100], [])).toBe(false)
  })
})
