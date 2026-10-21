import type { Brief } from '../creation/types'
import type { Brainstorm, Outline, Pending, Run } from './types'

export const recoverRequest = (pending: Pending | null, next: Pending) => pending ?? structuredClone(next)
export function canConfirm(draft: Brainstorm, outline: Outline | null, revision: number, dirty: boolean) {
  return !dirty && !draft.confirmed && draft.revision === revision && !!outline?.selectionReason?.trim() && !!outline?.directions.some(
    (item) => item.id === outline.selectedId && !!item.title.trim() && item.beats.length > 0,
  )
}
export const canUseRun = (draft: Brainstorm, run: Run, dirty: boolean) =>
  !dirty && !run.applied && ['SUCCEEDED', 'WAITING_USER', 'NEEDS_REVIEW'].includes(run.status) && !!run.output && run.inputRevision === draft.revision

interface Workspace {
  brief: Brief
  dirty: boolean
  draft: Brainstorm | null
  outline: Outline | null
  pending: Pending | null
  revision: number
}
export function mergeRemote<T extends Workspace>(local: T, remote: Brainstorm): T {
  if (local.draft && remote.revision < local.draft.revision) return local
  if (local.dirty || local.pending) return { ...local, draft: remote }
  return { ...local, draft: remote, brief: remote.brief, outline: remote.outline, revision: remote.revision }
}

export function normalizedOutline(outline: Outline | null): Outline | null {
  return outline ? { ...outline, selectionReason: outline.selectionReason?.trim() ?? '', directions: outline.directions.map((direction) => ({
    ...direction, beats: direction.beats.map((line) => line.trim()).filter(Boolean), reviewNotes: direction.reviewNotes.map((line) => line.trim()).filter(Boolean),
  })) } : null
}
