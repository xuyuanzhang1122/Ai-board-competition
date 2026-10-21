import { describe, expect, it } from 'vitest'

import { canConfirm, canUseRun, mergeRemote, normalizedOutline, recoverRequest } from './state'
import type { Brainstorm, Outline, Pending, Run } from './types'

const outline: Outline = { directions: [
  { id: 'a', title: '海上', angle: '传说', keyMessage: '各显神通', beats: ['起', '承'], emotion: '好奇', callToAction: '走近蓬莱', sourceIds: [], reviewNotes: ['传说演绎'] },
  { id: 'b', title: '岸边', angle: '创作', keyMessage: '合作', beats: ['起', '合'], emotion: '温暖', callToAction: '了解故事', sourceIds: [], reviewNotes: [] },
], selectedId: 'a', selectionReason: '适合参赛演示' }
const draft = { id: 1, revision: 2, brief: {} as never, outline, confirmed: false, creationDraftId: null, runs: [] } satisfies Brainstorm

describe('brainstorm workspace boundaries', () => {
  it('normalizes textarea lines without mutating the editable outline', () => {
    const edit = { ...outline, selectionReason: '  选择理由  ', directions: outline.directions.map(d => ({ ...d, beats: [' 起 ', '', '承'], reviewNotes: [' ', ' 待核实 '] })) }
    expect(normalizedOutline(edit)?.directions[0]?.beats).toEqual(['起', '承'])
    expect(normalizedOutline(edit)?.directions[0]?.reviewNotes).toEqual(['待核实'])
    expect(normalizedOutline(edit)?.selectionReason).toBe('选择理由')
    expect(edit.directions[0]?.beats).toEqual([' 起 ', '', '承'])
    expect(normalizedOutline(null)).toBeNull()
  })
  it('allows confirmation only for a saved selected direction on current server revision', () => {
    expect(canConfirm(draft, outline, 2, false)).toBe(true)
    expect(canConfirm(draft, { ...outline, selectedId: 'missing' }, 2, false)).toBe(false)
    expect(canConfirm(draft, outline, 1, false)).toBe(false)
    expect(canConfirm(draft, outline, 2, true)).toBe(false)
  })
  it('retains dirty edits and original base when server revision changes', () => {
    const local = { draft, brief: draft.brief, outline, revision: 2, dirty: true, pending: null }
    const remote = { ...draft, revision: 3, outline: { ...outline, selectedId: 'b' } }
    const next = mergeRemote(local, remote)
    expect(next.draft?.revision).toBe(3)
    expect(next.outline?.selectedId).toBe('a')
    expect(next.revision).toBe(2)
    const clean = mergeRemote({ ...local, dirty: false }, remote)
    expect(clean.outline?.selectedId).toBe('b')
    expect(clean.revision).toBe(3)
  })
  it('never replaces an uncertain generation UUID with a second submission', () => {
    const pending: Pending = { kind: 'run', id: 1, payload: { requestId: 'original', revision: 2, model: 'model' } }
    const next: Pending = { ...pending, payload: { ...pending.payload, requestId: 'new' } }
    expect(recoverRequest(pending, next)).toEqual(pending)
  })
  it('rejects stale, failed or already adopted candidates', () => {
    const run = { id: 1, inputRevision: 2, status: 'SUCCEEDED', output: outline, model: 'model', promptVersion: 1, error: null, steps: [] } satisfies Run
    expect(canUseRun(draft, run, false)).toBe(true)
    expect(canUseRun({ ...draft, revision: 3 }, run, false)).toBe(false)
    expect(canUseRun(draft, { ...run, status: 'FAILED' }, false)).toBe(false)
    expect(canUseRun(draft, run, true)).toBe(false)
  })
})
