import type { Board, Body, Draft, PendingRequest, Run } from './types'

/** Never replace an uncertain request with a new UUID or edited input. */
export const prepareRequest = (pending: PendingRequest | null, next: PendingRequest) =>
  pending ?? structuredClone(next)
export function settleRequest(pending: PendingRequest, error: unknown): PendingRequest | null {
  if (error === null) return null
  const rejection = error as { name?: string; code?: number } | null
  return rejection?.name === 'ApiBusinessError' &&
    typeof rejection.code === 'number' &&
    ((rejection.code >= 400 && rejection.code < 500) ||
      (rejection.code >= 40000 && rejection.code < 50000))
    ? null
    : pending
}
export const acceptResponse = (captured: string, current: string) => captured === current
export const mergePoll = (local: Draft, remote: Draft): Draft =>
  remote.revision >= local.revision ? remote : local
export const syncDraftList = (drafts: Draft[], draft: Draft) => [
  draft,
  ...drafts.filter((entry) => entry.id !== draft.id),
]
export const canAdopt = (draft: Draft, run: Run, dirty: boolean) =>
  !dirty && !run.applied && run.status === 'SUCCEEDED' && run.inputRevision === draft.revision

export function parseBoard(raw: string): Board {
  const value: unknown = JSON.parse(raw)
  const record = (item: unknown): item is Record<string, unknown> =>
    !!item && typeof item === 'object' && !Array.isArray(item)
  const strings = (item: unknown): item is string[] =>
    Array.isArray(item) && item.every((entry) => typeof entry === 'string')
  if (
    !record(value) ||
    value.version !== 1 ||
    typeof value.title !== 'string' ||
    !Array.isArray(value.assets) ||
    !Array.isArray(value.shots) ||
    !strings(value.reviewNotes)
  )
    throw new Error('分镜需包含 version:1、title、assets、shots 与 reviewNotes 数组')
  for (const asset of value.assets) {
    if (
      !record(asset) ||
      !['id', 'type', 'name', 'description'].every((key) => typeof asset[key] === 'string')
    )
      throw new Error('资产需包含 id、type、name 与 description')
  }
  for (const shot of value.shots) {
    if (
      !record(shot) ||
      !['id', 'visual', 'shotSize', 'cameraMovement', 'scene'].every(
        (key) => typeof shot[key] === 'string',
      ) ||
      !['characters', 'props', 'sourceIds'].every((key) => strings(shot[key])) ||
      typeof shot.no !== 'number' ||
      typeof shot.duration !== 'number' ||
      !['narration', 'dialogue', 'imagePrompt', 'videoPrompt'].every(
        (key) => shot[key] == null || typeof shot[key] === 'string',
      )
    )
      throw new Error('镜头结构不完整，请保留全部镜头字段与引用数组')
  }
  return value as unknown as Board
}

export function createEpochGate() {
  let epoch = 0
  return { next: () => ++epoch, accepts: (value: number) => value === epoch }
}

interface PollWorkspace {
  boardJson: string
  body: Body
  busy: boolean
  dirty: boolean
  draft: Draft | null
  drafts: Draft[]
  editRevision: number
  pending: PendingRequest | null
}
export function mergeWorkspacePoll<T extends PollWorkspace>(local: T, remote: Draft): T {
  const draft = local.draft ? mergePoll(local.draft, remote) : remote
  const next = { ...local, draft, drafts: syncDraftList(local.drafts, draft) }
  if (local.dirty || local.pending || local.busy) return next
  return {
    ...next,
    body: draft.body,
    editRevision: draft.revision,
    boardJson: draft.body.storyboard ? JSON.stringify(draft.body.storyboard, null, 2) : '',
  }
}
