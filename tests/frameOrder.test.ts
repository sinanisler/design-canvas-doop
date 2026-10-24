import { describe, expect, it } from 'vitest'
import type { Frame } from '../shared/types'
import { byStackOrder, placeFrames } from '../shared/frameOrder'

const frame = (id: string, z?: number, pageId = 'p1'): Frame => ({
  id,
  canvasId: 'c1',
  pageId,
  name: id,
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  html: '',
  createdAt: 0,
  updatedAt: 0,
  updatedBy: 'me',
  ...(z === undefined ? {} : { z }),
})

const ids = (frames: Frame[]) => frames.map((f) => f.id)

describe('placeFrames', () => {
  it('puts the named frames in the order given, in the slots they held', () => {
    const frames = [frame('a', 0), frame('b', 1), frame('c', 2)]
    expect(ids(placeFrames(frames, ['c', 'a', 'b']))).toEqual(['c', 'a', 'b'])
  })

  it('leaves frames that are not named where they were', () => {
    const frames = [frame('a', 0), frame('x', 1), frame('b', 2), frame('y', 3), frame('c', 4)]
    expect(ids(placeFrames(frames, ['c', 'b', 'a']))).toEqual(['c', 'x', 'b', 'y', 'a'])
  })

  it('numbers every frame by its index, so the stored order is the array order', () => {
    const frames = [frame('a', 10), frame('b', 20), frame('c', 30)]
    expect(placeFrames(frames, ['b', 'a', 'c']).map((f) => f.z)).toEqual([0, 1, 2])
  })

  it('returns new objects only for frames whose z moved', () => {
    const frames = [frame('a', 0), frame('b', 1), frame('c', 2)]
    const next = placeFrames(frames, ['a', 'c', 'b'])
    expect(next[0]).toBe(frames[0])
    expect(next[1]).not.toBe(frames[2])
    expect(next[2]).not.toBe(frames[1])
    expect(next[1]?.id).toBe('c')
  })

  it('leaves the input array alone', () => {
    const frames = [frame('a', 0), frame('b', 1)]
    placeFrames(frames, ['b', 'a'])
    expect(ids(frames)).toEqual(['a', 'b'])
  })

  it('orders frames back to front by z', () => {
    const sorted = [frame('late', 2), frame('early', 0), frame('mid', 1)].sort(byStackOrder)
    expect(ids(sorted)).toEqual(['early', 'mid', 'late'])
  })
})
