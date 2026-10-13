import type { StoryboardShotVO } from '@/shared/types/api'

/**
 * Merge a freshly fetched shot list into the previous one while preserving
 * object identity for shots whose content has not changed.
 *
 * Polling replaces the whole shot list every few seconds. Without identity
 * preservation, every `StoryboardRow` re-renders on each tick (the root cause
 * of the editor's 4GB / lag issue). By reusing the previous object reference
 * for unchanged shots, `React.memo` on the row can short-circuit re-renders.
 *
 * Order always follows `next` (the server is the source of truth for ordering).
 */
export function reconcileShots(
  prev: StoryboardShotVO[],
  next: StoryboardShotVO[],
): StoryboardShotVO[] {
  if (prev.length === 0) return next
  const prevById = new Map<number, StoryboardShotVO>()
  for (const shot of prev) prevById.set(shot.id, shot)

  let changed = prev.length !== next.length
  const merged = next.map((shot) => {
    const previous = prevById.get(shot.id)
    if (previous && JSON.stringify(previous) === JSON.stringify(shot)) {
      return previous
    }
    changed = true
    return shot
  })

  return changed ? merged : prev
}
