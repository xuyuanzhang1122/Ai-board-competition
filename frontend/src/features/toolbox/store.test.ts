import { describe, expect, it, vi } from 'vitest'

import type { ChatMessage, ChatSession } from './api'
import { createChatStore } from './store'

vi.mock('@/shared/store/user', () => ({ useUserStore: {} }))
vi.mock('./api', () => ({ toolboxApi: {} }))
const session: ChatSession = { id: 7, title: 'test', createdAt: '', updatedAt: '' }
const message = (id: number, role: 'USER' | 'ASSISTANT'): ChatMessage => ({
  id,
  role,
  type: 'TEXT',
  content: 'saved',
  model: 'catalog-model',
  jobId: 3,
  status: 'PENDING',
  resultUrl: null,
  errorMessage: null,
  createdAt: '',
})
function setup() {
  const api = {
    getSessions: vi.fn().mockResolvedValue([session]),
    createSession: vi.fn().mockResolvedValue(session),
    getSession: vi.fn().mockResolvedValue({ session, messages: [] }),
    sendMessage: vi.fn().mockResolvedValue({
      userMessage: message(1, 'USER'),
      assistantMessage: message(2, 'ASSISTANT'),
      jobId: 3,
    }),
    cancelMessage: vi.fn(),
    deleteSession: vi.fn(),
  }
  return { api, store: createChatStore(api, () => 'one-request-id') }
}
describe('server-owned conversation state', () => {
  it('retains the same request after unclear acceptance and only retries explicitly', async () => {
    const { api, store } = setup()
    await store.getState().open(7)
    api.sendMessage.mockRejectedValueOnce(new Error('network lost'))
    await store.getState().send('hello', 'catalog-model')
    expect(store.getState().pending?.command.clientRequestId).toBe('one-request-id')
    expect(api.sendMessage).toHaveBeenCalledTimes(1)
    await store.getState().retry()
    expect(api.sendMessage.mock.calls[0]).toEqual(api.sendMessage.mock.calls[1])
    expect(store.getState().pending).toBeNull()
    expect(store.getState().messages.map((m) => m.id)).toEqual([1, 2])
  })
  it('ignores an old session response after switching and never cancels server work', async () => {
    const { api, store } = setup()
    let finish!: (value: unknown) => void
    api.getSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const first = store.getState().open(7)
    await store.getState().open(null)
    finish({ session, messages: [message(1, 'USER')] })
    await first
    expect(store.getState().messages).toEqual([])
    expect(store.getState().activeId).toBeNull()
    expect(api.cancelMessage).not.toHaveBeenCalled()
  })
  it('refuses media submission while account capability is unavailable', async () => {
    const { api, store } = setup()
    await store.getState().open(7)
    await store.getState().send('picture', 'unknown', 'IMAGE')
    expect(api.sendMessage).not.toHaveBeenCalled()
    expect(store.getState().error).toContain('暂未开放')
  })
})

describe('reload and server refresh', () => {
  it('restores only the unresolved command after reload, never client-owned conversation history', async () => {
    const { api } = setup()
    const records = new Map<string, string>()
    const storage = {
      getItem: (key: string) => records.get(key) || null,
      setItem: (key: string, value: string) => {
        records.set(key, value)
      },
      removeItem: (key: string) => {
        records.delete(key)
      },
    }
    const first = createChatStore(api, () => 'survives-reload', storage)
    await first.getState().open(7)
    api.sendMessage.mockRejectedValueOnce(new Error('closed before acceptance'))
    await first.getState().send('hello', 'catalog-model')
    const reopened = createChatStore(api, () => 'must-not-be-used', storage)
    expect(reopened.getState().messages).toEqual([])
    expect(reopened.getState().pending?.command.clientRequestId).toBe('survives-reload')
    await reopened.getState().open(7)
    await reopened.getState().retry()
    expect(api.sendMessage.mock.calls[1]?.[1].clientRequestId).toBe('survives-reload')
    expect(records.size).toBe(0)
  })
  it('replaces observed task status and result with authoritative server messages', async () => {
    const { api, store } = setup()
    await store.getState().open(7)
    await store.getState().send('hello', 'catalog-model')
    api.getSession.mockResolvedValue({
      session,
      messages: [
        message(1, 'USER'),
        { ...message(2, 'ASSISTANT'), status: 'SUCCEEDED', content: 'Server result' },
      ],
    })
    await store.getState().refresh()
    expect(store.getState().messages[1]?.content).toBe('Server result')
    expect(store.getState().messages[1]?.status).toBe('SUCCEEDED')
  })
  it('does not let an earlier poll erase a newly accepted message', async () => {
    const { api, store } = setup()
    await store.getState().open(7)
    let finish!: (value: unknown) => void
    api.getSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const oldPoll = store.getState().refresh()
    await store.getState().send('hello', 'catalog-model')
    finish({ session, messages: [] })
    await oldPoll
    expect(store.getState().messages.map((item) => item.id)).toEqual([1, 2])
  })
})

describe('session lifecycle guards', () => {
  it('coalesces concurrent first sends into one session creation', async () => {
    const { api, store } = setup()
    const [first, second] = await Promise.all([
      store.getState().ensureSession('hello'),
      store.getState().ensureSession('hello'),
    ])
    expect(first).toBe(second)
    expect(api.createSession).toHaveBeenCalledTimes(1)
  })
  it('keeps an unresolved request session available for reconciliation', async () => {
    const { api, store } = setup()
    await store.getState().open(7)
    api.sendMessage.mockRejectedValueOnce(new Error('network'))
    await store.getState().send('hello', 'catalog-model')
    await store.getState().remove(7)
    expect(api.deleteSession).not.toHaveBeenCalled()
    expect(store.getState().pending?.sessionId).toBe(7)
  })
})
