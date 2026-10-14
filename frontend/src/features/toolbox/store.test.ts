import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ToolboxHistoryVO } from '@/shared/types/api'

import { type ConversationItem, selectEstimatedCost, useToolboxStore } from './store'

const apiMocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  deleteHistory: vi.fn(),
  deleteSession: vi.fn(),
  generate: vi.fn(),
  getHistory: vi.fn(),
  getJobStatus: vi.fn(),
  getSessions: vi.fn(),
  saveToAssets: vi.fn(),
  updateSession: vi.fn(),
}))

const userStoreState = vi.hoisted(() => ({
  fetchProfile: vi.fn(),
  token: '',
  user: null as { userId: number } | null,
  userId: null as number | null,
}))

vi.mock('./api', () => ({
  jobApi: { getJobStatus: apiMocks.getJobStatus },
  toolboxApi: {
    createSession: apiMocks.createSession,
    deleteHistory: apiMocks.deleteHistory,
    deleteSession: apiMocks.deleteSession,
    generate: apiMocks.generate,
    getHistory: apiMocks.getHistory,
    getSessions: apiMocks.getSessions,
    saveToAssets: apiMocks.saveToAssets,
    updateSession: apiMocks.updateSession,
  },
}))

vi.mock('@/shared/store/user', () => ({
  useUserStore: {
    getState: () => userStoreState,
  },
}))

const createLocalStorage = (): Storage => {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => [...values.keys()][index] ?? null),
    removeItem: vi.fn((key: string) => values.delete(key)),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
  }
}

const aiConversation = (id = 'ai-1'): ConversationItem => ({
  id,
  timestamp: 2,
  role: 'ai',
  contentType: 'IMAGE',
  aiResponse: {
    status: 'GENERATING',
    costPoints: 0,
    generationTime: 0,
  },
})

describe('toolbox store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    userStoreState.token = ''
    userStoreState.user = null
    userStoreState.userId = null
    vi.stubGlobal('localStorage', createLocalStorage())
    useToolboxStore.getState().reset()
  })

  it('updates VIDEO input defaults', () => {
    useToolboxStore.getState().setCurrentInput({ duration: 20 })
    useToolboxStore.getState().updateInputType('VIDEO')

    expect(useToolboxStore.getState().currentInput).toMatchObject({
      type: 'VIDEO',
      model: '',
      aspectRatio: '16:9',
      duration: 8,
    })
  })

  it('keeps competition point estimates free for text and video', () => {
    useToolboxStore.getState().setCurrentInput({
      type: 'TEXT',
      model: 'gemini-3.5-flash',
      prompt: '字'.repeat(250),
    })
    expect(selectEstimatedCost(useToolboxStore.getState())).toBe(0)

    useToolboxStore.getState().setCurrentInput({
      type: 'VIDEO',
      model: 'sd-api-2-fast-720p',
      duration: 10,
    })
    expect(selectEstimatedCost(useToolboxStore.getState())).toBe(0)
  })

  it('adds a conversation, syncs the active session, and persists it', () => {
    const store = useToolboxStore.getState()
    const session = store.createSessionObject()
    useToolboxStore.setState({ sessions: [session], activeSessionId: session.id })
    const conversation: ConversationItem = {
      id: 'user-1',
      timestamp: 1,
      role: 'user',
      contentType: 'TEXT',
      userInput: {
        type: 'TEXT',
        model: 'gemini-3.5-flash',
        prompt: '给我一个故事',
        estimatedCost: 1,
      },
    }

    useToolboxStore.getState().addConversation(conversation)

    const state = useToolboxStore.getState()
    expect(state.conversations).toEqual([conversation])
    expect(state.sessions[0].conversations).toEqual([conversation])
    expect(state.sessions[0].title).toBe('给我一个故事')
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'toolbox_conversations_guest',
      expect.stringContaining('给我一个故事'),
    )
  })

  it('merges a matching AI response and leaves state untouched for a missing id', () => {
    const conversation = aiConversation()
    useToolboxStore.setState({ conversations: [conversation] })

    useToolboxStore.getState().updateAIResponse('ai-1', {
      status: 'READY',
      resultUrl: '/result.png',
      costPoints: 12,
    })
    expect(useToolboxStore.getState().conversations[0].aiResponse).toMatchObject({
      status: 'READY',
      resultUrl: '/result.png',
      costPoints: 12,
      generationTime: 0,
    })

    const conversations = useToolboxStore.getState().conversations
    useToolboxStore.getState().updateAIResponse('missing', { status: 'FAILED' })
    expect(useToolboxStore.getState().conversations).toBe(conversations)
  })

  it('creates at most ten sessions, switches sessions, and restores an empty replacement', async () => {
    for (let index = 0; index < 12; index += 1) await useToolboxStore.getState().createSession()
    expect(useToolboxStore.getState().sessions).toHaveLength(10)

    const target = useToolboxStore.getState().sessions[1]
    const targetConversation = aiConversation('target-ai')
    useToolboxStore.setState((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === target.id ? { ...session, conversations: [targetConversation] } : session,
      ),
    }))
    useToolboxStore.getState().switchSession(target.id)
    expect(useToolboxStore.getState()).toMatchObject({
      activeSessionId: target.id,
      conversations: [targetConversation],
    })

    useToolboxStore.getState().reset()
    await useToolboxStore.getState().createSession()
    const onlySessionId = useToolboxStore.getState().activeSessionId
    expect(onlySessionId).not.toBeNull()
    await useToolboxStore.getState().deleteSession(onlySessionId!)
    expect(useToolboxStore.getState().sessions).toHaveLength(1)
    expect(useToolboxStore.getState().activeSessionId).toBe(
      useToolboxStore.getState().sessions[0].id,
    )
    expect(useToolboxStore.getState().conversations).toEqual([])
  })

  it('loads history as user and AI bubbles and converts SUCCEEDED to READY', () => {
    const session = useToolboxStore.getState().createSessionObject()
    useToolboxStore.setState({ sessions: [session], activeSessionId: session.id })
    const historyItem: ToolboxHistoryVO = {
      id: 42,
      sessionId: 7,
      type: 'IMAGE',
      model: 'gpt-image-2-vip',
      prompt: '一座云端城市',
      aspectRatio: '16:9',
      text: null,
      resultUrl: '/cloud-city.png',
      status: 'SUCCEEDED',
      costPoints: 15,
      createdAt: '2026-06-27T10:00:00',
      expireAt: '2026-07-04T10:00:00',
    }

    useToolboxStore.getState().loadHistoryToChat(historyItem)

    const conversations = useToolboxStore.getState().conversations
    expect(conversations).toHaveLength(2)
    expect(conversations[0]).toMatchObject({
      role: 'user',
      contentType: 'IMAGE',
      userInput: { prompt: '一座云端城市', estimatedCost: 15 },
    })
    expect(conversations[1]).toMatchObject({
      role: 'ai',
      contentType: 'IMAGE',
      aiResponse: {
        status: 'READY',
        resultUrl: '/cloud-city.png',
        historyId: 42,
      },
    })
  })

  it('waits for server deletion and removes the linked history from state', async () => {
    apiMocks.deleteSession.mockResolvedValue(undefined)
    const session = {
      ...useToolboxStore.getState().createSessionObject('远端对话'),
      id: 'server-9',
      remoteId: 9,
    }
    const historyItem = {
      id: 42,
      sessionId: 9,
      type: 'TEXT',
      model: 'gemini-3.5-flash',
      prompt: '测试',
      aspectRatio: null,
      text: '结果',
      resultUrl: null,
      status: 'SUCCEEDED',
      costPoints: 1,
      createdAt: '2026-06-27T10:00:00',
      expireAt: '2026-07-04T10:00:00',
    } satisfies ToolboxHistoryVO
    useToolboxStore.setState({
      sessions: [session],
      activeSessionId: session.id,
      history: [historyItem],
    })

    await useToolboxStore.getState().deleteSession(session.id)

    expect(apiMocks.deleteSession).toHaveBeenCalledWith(9)
    expect(useToolboxStore.getState().history).toEqual([])
  })

  it('loads the legacy flat conversation storage format', () => {
    const legacyConversation = aiConversation('legacy-ai')
    localStorage.setItem('toolbox_conversations', JSON.stringify([legacyConversation]))

    useToolboxStore.getState().loadConversationsFromStorage()

    expect(useToolboxStore.getState().sessions).toHaveLength(1)
    expect(useToolboxStore.getState().sessions[0].title).toBe('默认对话')
    expect(useToolboxStore.getState().conversations).toEqual([])
  })

  it('never imports guest legacy conversations into an authenticated user cache', () => {
    userStoreState.token = 'token-a'
    userStoreState.userId = 101
    localStorage.setItem('toolbox_conversations', JSON.stringify([aiConversation('guest-ai')]))

    useToolboxStore.getState().loadConversationsFromStorage()

    expect(useToolboxStore.getState().getConversationStorageKey()).toBe(
      'toolbox_conversations_user_101',
    )
    expect(useToolboxStore.getState().conversations).toEqual([])
    expect(useToolboxStore.getState().sessions[0].title).toBe('新对话')
  })
})
