import { describe, expect, it } from 'vitest'

import type { StoryboardShotVO } from '@/shared/types/api'

import { reconcileShots } from './reconcile-shots'

const makeShot = (id: number, scriptText = `shot-${id}`): StoryboardShotVO =>
  ({
    createdAt: '',
    id,
    props: [],
    scene: null,
    characters: [],
    scriptText,
    shotNo: id,
    shotImage: { status: 'NONE' },
    updatedAt: '',
    video: { status: 'NONE' },
  }) as unknown as StoryboardShotVO

describe('reconcileShots', () => {
  it('keeps the previous object reference for unchanged shots', () => {
    const prev = [makeShot(1), makeShot(2)]
    const next = [makeShot(1), makeShot(2)] // deep-equal but new references
    const merged = reconcileShots(prev, next)
    expect(merged[0]).toBe(prev[0])
    expect(merged[1]).toBe(prev[1])
  })

  it('returns the previous array reference when nothing changed', () => {
    const prev = [makeShot(1), makeShot(2)]
    const next = [makeShot(1), makeShot(2)]
    expect(reconcileShots(prev, next)).toBe(prev)
  })

  it('uses the new reference only for shots whose content changed', () => {
    const prev = [makeShot(1), makeShot(2)]
    const next = [makeShot(1), makeShot(2, 'edited')]
    const merged = reconcileShots(prev, next)
    expect(merged[0]).toBe(prev[0])
    expect(merged[1]).toBe(next[1])
    expect(merged[1]).not.toBe(prev[1])
  })

  it('follows the order and membership of the next list (adds/removes)', () => {
    const prev = [makeShot(1), makeShot(2)]
    const next = [makeShot(2), makeShot(3)]
    const merged = reconcileShots(prev, next)
    expect(merged.map((shot) => shot.id)).toEqual([2, 3])
    expect(merged[0]).toBe(prev[1]) // shot 2 unchanged → kept reference
  })

  it('returns next as-is when there was no previous list', () => {
    const next = [makeShot(1)]
    expect(reconcileShots([], next)).toBe(next)
  })
})
