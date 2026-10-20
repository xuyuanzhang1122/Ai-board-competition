import { describe, expect, it } from 'vitest'

import {
  acceptResponse,
  canAdopt,
  createEpochGate,
  mergePoll,
  parseBoard,
  prepareRequest,
  settleRequest,
} from './state'
import type { Draft, PendingRequest } from './types'

const draft = { id: 1, revision: 7, body: { script: '人工剧本' }, runs: [] } as unknown as Draft
const request: PendingRequest = {
  kind: 'generate',
  draftId: 1,
  payload: { requestId: 'original-uuid', revision: 7, stage: 'SCRIPT', model: 'catalog-model' },
}

describe('creation request recovery', () => {
  it('retries an unknown acceptance with the original UUID and frozen payload', () => {
    const unknown = settleRequest(request, new Error('timeout'))
    expect(
      prepareRequest(unknown, {
        ...request,
        payload: { ...request.payload, requestId: 'new-uuid', revision: 8 },
      }),
    ).toEqual(request)
  })
  it('clears confirmed business rejection but retains server and transport uncertainty', () => {
    expect(settleRequest(request, { name: 'ApiBusinessError', code: 400 })).toBeNull()
    expect(settleRequest(request, { name: 'ApiBusinessError', code: 500 })).toEqual(request)
    expect(settleRequest(request, { name: 'ApiBusinessError', code: 40002 })).toBeNull()
    expect(settleRequest(request, { name: 'ApiBusinessError', code: 50202 })).toEqual(request)
    expect(settleRequest(request, null)).toBeNull()
  })
})

describe('creation session boundaries', () => {
  it('rejects responses after an account or route epoch changes', () => {
    expect(acceptResponse('1:tokenA:/creation/1:2', '2:tokenB:/creation/1:2')).toBe(false)
    expect(acceptResponse('1:tokenA:/creation/1:2', '1:tokenA:/creation/2:3')).toBe(false)
    expect(acceptResponse('same', 'same')).toBe(true)
  })
  it('polling only refreshes runs and never overwrites an edited body or revision', () => {
    const remote = {
      ...draft,
      revision: 9,
      body: { ...draft.body, script: '旧请求结果' },
      runs: [{ id: 8 }],
    } as Draft
    expect(mergePoll(draft, remote)).toEqual({ ...draft, runs: remote.runs })
  })
  it('rejects stale, invalid, or already applied candidates', () => {
    const run = {
      id: 1,
      status: 'SUCCEEDED',
      inputRevision: 7,
      applied: false,
    } as Draft['runs'][number]
    expect(canAdopt(draft, run, false)).toBe(true)
    expect(canAdopt(draft, { ...run, inputRevision: 6 }, false)).toBe(false)
    expect(canAdopt(draft, { ...run, status: 'INVALID' }, false)).toBe(false)
    expect(canAdopt(draft, { ...run, applied: true }, false)).toBe(false)
    expect(canAdopt(draft, run, true)).toBe(false)
  })
})

describe('advanced storyboard JSON safety', () => {
  it('rejects malformed shapes before the structured editor renders them', () => {
    expect(() => parseBoard('{"version":1,"assets":null,"shots":[],"reviewNotes":[]}')).toThrow()
    expect(() =>
      parseBoard('{"version":1,"title":"x","assets":[],"shots":[{}],"reviewNotes":[]}'),
    ).toThrow()
  })
  it('preserves the full structured payload including prompts and source references', () => {
    const board = { version: 1, title: '灯塔', assets: [], shots: [], reviewNotes: ['人工复核'] }
    expect(parseBoard(JSON.stringify(board))).toEqual(board)
  })
})

describe('async epoch gate', () => {
  it('drops a late response from a cleaned up effect even after the same route is entered again', async () => {
    const gate = createEpochGate()
    let finish!: (value: string) => void
    const delayed = new Promise<string>((resolve) => {
      finish = resolve
    })
    const old = gate.next()
    const output: string[] = []
    const result = delayed.then((value) => {
      if (gate.accepts(old)) output.push(value)
    })
    const active = gate.next()
    finish('old body')
    await result
    expect(output).toEqual([])
    expect(gate.accepts(active)).toBe(true)
  })
})
