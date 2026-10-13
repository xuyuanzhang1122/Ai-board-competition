import { create } from 'zustand'

import { useUserStore } from '@/shared/store/user'
import type {
  ToolboxGenerateRequest,
  ToolboxGenerateResponse,
  ToolboxHistoryVO,
  ToolboxSessionVO,
} from '@/shared/types/api'

import { jobApi, toolboxApi } from './api'
import { calculateEstimatedCost, getDefaultAspectRatio } from './constants/toolbox-models'

export type ToolboxInputType = 'TEXT' | 'IMAGE' | 'VIDEO'

export interface ConversationItem {
  aiResponse?: {
    status: 'GENERATING' | 'READY' | 'FAILED'
    text?: string
    resultUrl?: string
    allImageUrls?: string[]
    costPoints: number
    generationTime: number
    errorMessage?: string
    historyId?: number
  }
  contentType: ToolboxInputType
  id: string
  role: 'user' | 'ai'
  timestamp: number
  userInput?: {
    type: ToolboxInputType
    model: string
    aspectRatio?: string
    prompt: string
    estimatedCost: number
    duration?: number
  }
}

export interface ToolboxSession {
  conversations: ConversationItem[]
  createdAt: number
  id: string
  remoteId?: number
  title: string
  updatedAt: number
}

export interface CurrentToolboxInput {
  aspectRatio: string
  background: string
  count: number
  duration: number
  model: string
  outputFormat: string
  prompt: string
  quality: string
  type: ToolboxInputType
}

interface ToolboxDataState {
  activeSessionId: string | null
  conversations: ConversationItem[]
  currentGeneration: ToolboxGenerateResponse | null
  currentInput: CurrentToolboxInput
  history: ToolboxHistoryVO[]
  loading: boolean
  pollingConversationId: string | null
  pollingJobId: number | null
  pollingTimer: ReturnType<typeof setInterval> | null
  sessions: ToolboxSession[]
}

type ServerSessionLoadResult = 'empty' | 'loaded' | 'unavailable'

export interface ToolboxState extends ToolboxDataState {
  addConversation: (item: ConversationItem) => void
  createSession: () => Promise<void>
  createSessionObject: (title?: string, conversations?: ConversationItem[]) => ToolboxSession
  deleteHistory: (id: number) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  fetchHistory: () => Promise<void>
  fetchSessionsFromServer: () => Promise<ServerSessionLoadResult>
  generate: (data: ToolboxGenerateRequest) => Promise<ToolboxGenerateResponse>
  generateWithConversation: (
    referenceImageUrl?: string,
  ) => Promise<{ success: true; aiConversationId: string }>
  getConversationStorageKey: () => string
  init: () => Promise<void>
  loadActiveSessionConversations: () => void
  loadConversationsFromStorage: () => void
  loadHistoryToChat: (historyItem: ToolboxHistoryVO) => void
  persistActiveSessionToServer: () => Promise<number | null>
  reset: () => void
  saveConversationsToStorage: () => void
  saveToAssets: (id: number) => Promise<void>
  sessionFromServer: (item: ToolboxSessionVO) => ToolboxSession
  setCurrentInput: (patch: Partial<CurrentToolboxInput>) => void
  startJobPolling: (jobId: number, conversationId?: string) => void
  stopJobPolling: () => void
  switchSession: (sessionId: string) => void
  syncActiveSession: () => void
  updateAIResponse: (
    conversationId: string,
    response: Partial<NonNullable<ConversationItem['aiResponse']>>,
  ) => void
  updateInputType: (type: ToolboxInputType) => void
}

const createInitialState = (): ToolboxDataState => ({
  history: [],
  loading: false,
  currentGeneration: null,
  pollingJobId: null,
  pollingTimer: null,
  pollingConversationId: null,
  conversations: [],
  sessions: [],
  activeSessionId: null,
  currentInput: {
    type: 'TEXT',
    model: '',
    aspectRatio: '',
    prompt: '',
    duration: 8,
    count: 1,
    quality: '',
    outputFormat: '',
    background: '',
  },
})

const completedHistoryStatus = (status: string): 'GENERATING' | 'READY' | 'FAILED' =>
  status === 'SUCCEEDED' ? 'READY' : (status as 'GENERATING' | 'READY' | 'FAILED')

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '生成失败'

const sessionPersistRequests = new Map<string, Promise<number | null>>()

export const useToolboxStore = create<ToolboxState>((set, get) => ({
  ...createInitialState(),

  async generate(data) {
    set({ loading: true })
    try {
      const response = await toolboxApi.generate(data)
      set({ currentGeneration: response })

      if (response.jobId && response.status !== 'SUCCEEDED') {
        get().startJobPolling(response.jobId)
      } else {
        setTimeout(() => void get().fetchHistory(), 500)
      }

      return response
    } finally {
      set({ loading: false })
    }
  },

  async fetchHistory() {
    set({ loading: true })
    try {
      const history = await toolboxApi.getHistory({ page: 1, size: 100 })
      set({ history: Array.isArray(history) ? history : [] })
    } catch (error) {
      console.error('[ToolboxStore] Fetch history failed:', error)
      set({ history: [] })
    } finally {
      set({ loading: false })
    }
  },

  async deleteHistory(id) {
    await toolboxApi.deleteHistory(id)
    set((state) => ({ history: state.history.filter((item) => item.id !== id) }))
  },

  async saveToAssets(id) {
    await toolboxApi.saveToAssets(id)
    await get().fetchHistory()
  },

  startJobPolling(jobId, conversationId) {
    get().stopJobPolling()
    set({ pollingJobId: jobId, pollingConversationId: conversationId || null })

    const pollingTimer = setInterval(async () => {
      try {
        const job = await jobApi.getJobStatus(jobId)

        if (job.status === 'COMPLETED' || job.status === 'SUCCEEDED') {
          const pollingConversationId = get().pollingConversationId
          if (pollingConversationId) {
            get().updateAIResponse(pollingConversationId, {
              status: 'READY',
              resultUrl: job.resultUrl || undefined,
              allImageUrls: job.allImageUrls || undefined,
              costPoints: job.costPoints || 0,
              historyId: jobId,
            })
          }

          get().stopJobPolling()
          await get().fetchHistory()
        } else if (job.status === 'FAILED') {
          const pollingConversationId = get().pollingConversationId
          if (pollingConversationId) {
            get().updateAIResponse(pollingConversationId, {
              status: 'FAILED',
              errorMessage: job.errorMessage || '生成失败',
            })
          }
          get().stopJobPolling()
        }
      } catch (error) {
        // Keep polling after transient network errors, matching the legacy behavior.
        console.error('[ToolboxStore] Polling error:', error)
      }
    }, 3000)

    set({ pollingTimer })
  },

  stopJobPolling() {
    const pollingTimer = get().pollingTimer
    if (pollingTimer) clearInterval(pollingTimer)
    set({ pollingTimer: null, pollingJobId: null, pollingConversationId: null })
  },

  reset() {
    get().stopJobPolling()
    set(createInitialState())
  },

  setCurrentInput(patch) {
    set((state) => ({ currentInput: { ...state.currentInput, ...patch } }))
  },

  updateInputType(type) {
    get().setCurrentInput({
      type,
      model: '',
      aspectRatio: getDefaultAspectRatio(type),
      count: 1,
      quality: '',
      outputFormat: '',
      background: '',
      ...(type === 'VIDEO' ? { duration: 8 } : {}),
    })
  },

  addConversation(item) {
    set((state) => ({ conversations: [...state.conversations, item] }))
    get().syncActiveSession()
    get().saveConversationsToStorage()
  },

  updateAIResponse(conversationId, response) {
    const hasConversation = get().conversations.some(
      (conversation) => conversation.id === conversationId && conversation.aiResponse,
    )
    if (!hasConversation) return

    set((state) => ({
      conversations: state.conversations.map((conversation) => {
        if (conversation.id !== conversationId || !conversation.aiResponse) return conversation
        return {
          ...conversation,
          aiResponse: { ...conversation.aiResponse, ...response },
        }
      }),
    }))
    get().syncActiveSession()
    get().saveConversationsToStorage()
  },

  saveConversationsToStorage() {
    try {
      get().syncActiveSession()
      const state = get()
      localStorage.setItem(
        state.getConversationStorageKey(),
        JSON.stringify({
          activeSessionId: state.activeSessionId,
          sessions: state.sessions.slice(0, 10).map((session) => ({
            ...session,
            conversations: session.conversations.slice(-100),
          })),
        }),
      )
      void get().persistActiveSessionToServer()
    } catch (error) {
      console.warn('[ToolboxStore] Failed to save conversations to localStorage:', error)
    }
  },

  loadConversationsFromStorage() {
    try {
      const userState = useUserStore.getState()
      if (userState.token && !userState.userId) {
        const session = get().createSessionObject('新对话')
        set({ sessions: [session], activeSessionId: session.id, conversations: [] })
        return
      }

      const storageKey = get().getConversationStorageKey()
      const saved = localStorage.getItem(storageKey)
      let sessions: ToolboxSession[] = []
      let activeSessionId: string | null = null

      if (saved) {
        const parsed = JSON.parse(saved) as
          | { activeSessionId?: string; sessions?: ToolboxSession[] }
          | ConversationItem[]
        if (!Array.isArray(parsed) && Array.isArray(parsed.sessions)) {
          sessions = parsed.sessions.slice(0, 10).map((session) => ({
            ...session,
            conversations: (session.conversations || []).filter(
              (conversation) =>
                conversation.role === 'user' || conversation.aiResponse?.status !== 'GENERATING',
            ),
          }))
          activeSessionId = parsed.activeSessionId || sessions[0]?.id || null
        } else if (Array.isArray(parsed)) {
          sessions = [
            get().createSessionObject(
              '默认对话',
              parsed.filter(
                (conversation) =>
                  conversation.role === 'user' || conversation.aiResponse?.status !== 'GENERATING',
              ),
            ),
          ]
          activeSessionId = sessions[0].id
        }
      } else if (!userState.token) {
        const legacy = localStorage.getItem('toolbox_conversations')
        if (legacy) {
          const parsed = JSON.parse(legacy) as ConversationItem[]
          sessions = [
            get().createSessionObject(
              '默认对话',
              parsed.filter(
                (conversation) =>
                  conversation.role === 'user' || conversation.aiResponse?.status !== 'GENERATING',
              ),
            ),
          ]
          activeSessionId = sessions[0].id
        }
      }

      if (sessions.length === 0) {
        const session = get().createSessionObject('新对话')
        sessions = [session]
        activeSessionId = session.id
      }

      set({ sessions, activeSessionId })
      get().loadActiveSessionConversations()
    } catch (error) {
      console.warn('[ToolboxStore] Failed to load conversations from localStorage:', error)
      const session = get().createSessionObject('新对话')
      set({ sessions: [session], activeSessionId: session.id, conversations: [] })
    }
  },

  async init() {
    const userState = useUserStore.getState()
    if (userState.token && !userState.userId) {
      try {
        await userState.fetchProfile()
      } catch (error) {
        console.warn('[ToolboxStore] Failed to resolve authenticated user identity:', error)
      }
    }

    if (useUserStore.getState().token) {
      const serverResult = await get().fetchSessionsFromServer()
      if (serverResult === 'empty') {
        const session = get().createSessionObject('新对话')
        set({ sessions: [session], activeSessionId: session.id, conversations: [] })
        await get().persistActiveSessionToServer()
        get().saveConversationsToStorage()
      } else if (serverResult === 'unavailable') {
        get().loadConversationsFromStorage()
      }
    } else {
      get().loadConversationsFromStorage()
    }
    await get().fetchHistory()
  },

  loadHistoryToChat(historyItem) {
    set({ conversations: [] })
    get().syncActiveSession()

    const createdAt = new Date(historyItem.createdAt).getTime()
    get().addConversation({
      id: `user-${Date.now()}`,
      timestamp: createdAt,
      role: 'user',
      contentType: historyItem.type as ToolboxInputType,
      userInput: {
        type: historyItem.type as ToolboxInputType,
        model: historyItem.model || 'unknown',
        aspectRatio: historyItem.aspectRatio || '',
        prompt: historyItem.prompt || '(无提示词)',
        estimatedCost: historyItem.costPoints || 0,
      },
    })

    get().addConversation({
      id: `ai-${Date.now()}`,
      timestamp: createdAt + 1,
      role: 'ai',
      contentType: historyItem.type as ToolboxInputType,
      aiResponse: {
        status: completedHistoryStatus(historyItem.status),
        text: historyItem.text || undefined,
        resultUrl: historyItem.resultUrl || undefined,
        costPoints: historyItem.costPoints || 0,
        generationTime: 0,
        historyId: historyItem.id,
      },
    })
  },

  getConversationStorageKey() {
    const userStore = useUserStore.getState()
    const userId = userStore.userId || userStore.user?.userId
    const userPart = userId ? `user_${userId}` : userStore.token ? 'user_unresolved' : 'guest'
    return `toolbox_conversations_${userPart}`
  },

  createSessionObject(title = '新对话', conversations = []) {
    const now = Date.now()
    return {
      id: `session-${now}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      createdAt: now,
      updatedAt: now,
      conversations,
    }
  },

  sessionFromServer(item) {
    let conversations: ConversationItem[] = []
    try {
      conversations = JSON.parse(item.conversationsJson || '[]') as ConversationItem[]
    } catch (error) {
      console.warn('[ToolboxStore] Failed to parse server session conversations:', error)
    }

    return {
      id: `server-${item.id}`,
      remoteId: item.id,
      title: item.title,
      createdAt: new Date(item.createdAt).getTime(),
      updatedAt: new Date(item.updatedAt).getTime(),
      conversations,
    }
  },

  async fetchSessionsFromServer() {
    if (!useUserStore.getState().token) return 'unavailable'
    try {
      const sessions = await toolboxApi.getSessions()
      if (sessions.length === 0) return 'empty'

      const mappedSessions = sessions.slice(0, 10).map(get().sessionFromServer)
      set({ sessions: mappedSessions, activeSessionId: mappedSessions[0].id })
      get().loadActiveSessionConversations()
      localStorage.setItem(
        get().getConversationStorageKey(),
        JSON.stringify({ activeSessionId: get().activeSessionId, sessions: get().sessions }),
      )
      return 'loaded'
    } catch (error) {
      console.warn('[ToolboxStore] Failed to fetch server sessions:', error)
      return 'unavailable'
    }
  },

  async persistActiveSessionToServer() {
    if (!useUserStore.getState().token) return null
    const state = get()
    const session = state.sessions.find((item) => item.id === state.activeSessionId)
    if (!session) return null

    const pending = sessionPersistRequests.get(session.id)
    if (pending) return pending

    const payload = {
      title: session.title || '新对话',
      conversationsJson: JSON.stringify(session.conversations || []),
    }

    const persistRequest = (async (): Promise<number | null> => {
      try {
        if (session.remoteId) {
          await toolboxApi.updateSession(session.remoteId, payload)
          return session.remoteId
        }

        const localId = session.id
        const created = await toolboxApi.createSession(payload)
        set((current) => ({
          sessions: current.sessions.map((item) =>
            item.id === localId
              ? { ...item, id: `server-${created.id}`, remoteId: created.id }
              : item,
          ),
          activeSessionId:
            current.activeSessionId === localId ? `server-${created.id}` : current.activeSessionId,
        }))

        const latest = get().sessions.find((item) => item.remoteId === created.id)
        if (latest) {
          const latestPayload = {
            title: latest.title || '新对话',
            conversationsJson: JSON.stringify(latest.conversations || []),
          }
          if (
            latestPayload.title !== payload.title ||
            latestPayload.conversationsJson !== payload.conversationsJson
          ) {
            await toolboxApi.updateSession(created.id, latestPayload)
          }
        }
        return created.id
      } catch (error) {
        console.warn('[ToolboxStore] Failed to persist server session:', error)
        return null
      }
    })()

    sessionPersistRequests.set(session.id, persistRequest)
    try {
      return await persistRequest
    } finally {
      sessionPersistRequests.delete(session.id)
    }
  },

  syncActiveSession() {
    const state = get()
    const firstPrompt = state.conversations.find((item) => item.userInput?.prompt)?.userInput?.prompt
    set((current) => ({
      sessions: current.sessions.map((session) => {
        if (session.id !== current.activeSessionId) return session
        const shouldRename =
          firstPrompt && (session.title === '新对话' || session.title === '默认对话')
        return {
          ...session,
          conversations: [...current.conversations],
          updatedAt: Date.now(),
          title: shouldRename
            ? firstPrompt.length > 18
              ? `${firstPrompt.slice(0, 18)}...`
              : firstPrompt
            : session.title,
        }
      }),
    }))
  },

  loadActiveSessionConversations() {
    const state = get()
    const session = state.sessions.find((item) => item.id === state.activeSessionId)
    set({ conversations: session ? [...session.conversations] : [] })
  },

  async createSession() {
    get().syncActiveSession()
    const session = get().createSessionObject('新对话')
    set((state) => ({
      sessions: [session, ...state.sessions].slice(0, 10),
      activeSessionId: session.id,
      conversations: [],
    }))
    get().saveConversationsToStorage()
    await get().persistActiveSessionToServer()
  },

  switchSession(sessionId) {
    if (sessionId === get().activeSessionId) return
    get().syncActiveSession()
    set({ activeSessionId: sessionId })
    get().loadActiveSessionConversations()
    get().saveConversationsToStorage()
  },

  async deleteSession(sessionId) {
    const initialTarget = get().sessions.find((session) => session.id === sessionId)
    if (!initialTarget) return

    let remoteId = initialTarget.remoteId
    const pendingPersist = sessionPersistRequests.get(initialTarget.id)
    if (!remoteId && pendingPersist) remoteId = (await pendingPersist) || undefined

    const target =
      get().sessions.find(
        (session) => session.id === sessionId || (remoteId && session.remoteId === remoteId),
      ) || initialTarget
    if (remoteId) await toolboxApi.deleteSession(remoteId)

    let sessions = get().sessions.filter((session) => session.id !== target.id)
    if (sessions.length === 0) sessions = [get().createSessionObject('新对话')]

    const currentActiveSessionId = get().activeSessionId
    const shouldSwitchActiveSession =
      currentActiveSessionId === target.id ||
      !sessions.some((session) => session.id === currentActiveSessionId)
    const activeSessionId = shouldSwitchActiveSession ? sessions[0].id : currentActiveSessionId
    set((state) => ({
      sessions,
      activeSessionId,
      history: remoteId
        ? state.history.filter((item) => item.sessionId !== remoteId)
        : state.history,
    }))
    if (shouldSwitchActiveSession) get().loadActiveSessionConversations()
    get().saveConversationsToStorage()
    await get().persistActiveSessionToServer()
  },

  async generateWithConversation(referenceImageUrl) {
    const startTime = Date.now()
    const submittedInput = { ...get().currentInput }
    const submittedEstimatedCost = selectEstimatedCost(get())
    get().setCurrentInput({ prompt: '' })

    get().addConversation({
      id: `user-${Date.now()}`,
      timestamp: Date.now(),
      role: 'user',
      contentType: submittedInput.type,
      userInput: {
        type: submittedInput.type,
        model: submittedInput.model,
        aspectRatio: submittedInput.aspectRatio,
        prompt: submittedInput.prompt,
        estimatedCost: submittedEstimatedCost,
        duration: submittedInput.type === 'VIDEO' ? submittedInput.duration : undefined,
      },
    })

    const aiConversationId = `ai-${Date.now()}`
    get().addConversation({
      id: aiConversationId,
      timestamp: Date.now() + 1,
      role: 'ai',
      contentType: submittedInput.type,
      aiResponse: {
        status: 'GENERATING',
        costPoints: 0,
        generationTime: 0,
      },
    })

    const isImage = submittedInput.type === 'IMAGE'
    const request: ToolboxGenerateRequest = {
      sessionId: 0,
      type: submittedInput.type,
      prompt: submittedInput.prompt,
      model: submittedInput.model,
      aspectRatio: submittedInput.aspectRatio || undefined,
      duration: submittedInput.type === 'VIDEO' ? submittedInput.duration : undefined,
      referenceImageUrl: referenceImageUrl || undefined,
      count: isImage && submittedInput.count > 1 ? submittedInput.count : undefined,
      quality: isImage ? submittedInput.quality || undefined : undefined,
      outputFormat: isImage ? submittedInput.outputFormat || undefined : undefined,
      background: isImage ? submittedInput.background || undefined : undefined,
    }

    try {
      const sessionId = await get().persistActiveSessionToServer()
      if (!sessionId) throw new Error('会话尚未同步，无法开始生成，请稍后重试')
      request.sessionId = sessionId
      const response = await get().generate(request)
      const generationTime = Math.round((Date.now() - startTime) / 1000)

      if (response.jobId && response.status !== 'SUCCEEDED') {
        get().startJobPolling(response.jobId, aiConversationId)
      } else {
        get().updateAIResponse(aiConversationId, {
          status: 'READY',
          text: response.text || undefined,
          resultUrl: response.resultUrl || undefined,
          costPoints: response.costPoints || 0,
          generationTime,
          historyId: response.jobId || undefined,
        })
      }

      return { success: true, aiConversationId }
    } catch (error) {
      get().updateAIResponse(aiConversationId, {
        status: 'FAILED',
        errorMessage: errorMessage(error),
        generationTime: Math.round((Date.now() - startTime) / 1000),
      })
      throw error
    }
  },
}))

export const selectActiveSession = (state: ToolboxState): ToolboxSession | null =>
  state.sessions.find((session) => session.id === state.activeSessionId) || null

export const selectIsGenerating = (state: ToolboxState): boolean =>
  state.pollingJobId !== null || state.loading

export const selectEstimatedCost = (state: ToolboxState): number =>
  calculateEstimatedCost(state.currentInput.type, state.currentInput.model, {
    promptLength: state.currentInput.prompt.length,
    duration: state.currentInput.duration,
  })
