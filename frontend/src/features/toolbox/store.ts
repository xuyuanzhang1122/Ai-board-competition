import { createStore } from 'zustand/vanilla'

import {
  type ChatMessage,
  type ChatSession,
  type MessageType,
  type SendCommand,
  toolboxApi,
} from './api'

export interface PendingSend {
  command: SendCommand
  sessionId: number
}
interface ChatState {
  activeId: number | null
  cancel: (id: number) => Promise<void>
  clearError: () => void
  ensureSession: (title: string) => Promise<number>
  error: string | null
  list: () => Promise<void>
  loading: boolean
  messages: ChatMessage[]
  open: (id: number | null) => Promise<void>
  pending: PendingSend | null
  refresh: () => Promise<void>
  remove: (id: number) => Promise<void>
  retry: () => Promise<void>
  send: (content: string, model: string, type?: MessageType) => Promise<void>
  sending: boolean
  sessions: ChatSession[]
}
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : '暂时无法连接服务，请重试'
const pendingKey = 'competition-toolbox-pending-request'
export function createChatStore(
  client: typeof toolboxApi = toolboxApi,
  uuid: () => string = () => crypto.randomUUID(),
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
) {
  let initialPending: PendingSend | null = null
  try {
    const saved = JSON.parse(storage?.getItem(pendingKey) || 'null') as PendingSend | null
    if (saved?.sessionId && saved.command?.clientRequestId && saved.command.type === 'TEXT')
      initialPending = saved
  } catch {
    /* A damaged retry record must never become a new request. */
  }
  let revision = 0
  let creatingSession: Promise<ChatSession> | null = null
  const savePending = (value: PendingSend | null) => {
    try {
      if (value) storage?.setItem(pendingKey, JSON.stringify(value))
      else storage?.removeItem(pendingKey)
    } catch {
      /* Retry remains available in memory. */
    }
  }
  return createStore<ChatState>((set, get) => ({
    sessions: [],
    activeId: null,
    messages: [],
    loading: false,
    sending: false,
    error: null,
    pending: initialPending,
    clearError: () => set({ error: null }),
    async list() {
      try {
        set({ sessions: await client.getSessions() })
      } catch (error) {
        set({ error: errorText(error) })
      }
    },
    async open(id) {
      const token = ++revision
      set({ activeId: id, messages: [], loading: id !== null, error: null })
      if (id === null) return
      try {
        const detail = await client.getSession(id)
        if (token === revision) set({ messages: detail.messages, loading: false })
      } catch (error) {
        if (token === revision) set({ loading: false, error: errorText(error) })
      }
    },
    async refresh() {
      const id = get().activeId
      const token = revision
      if (id === null || get().loading) return
      try {
        const detail = await client.getSession(id)
        if (id === get().activeId && token === revision)
          set({ messages: detail.messages, error: null })
      } catch (error) {
        if (id === get().activeId && token === revision)
          set({ error: `更新会话失败：${errorText(error)}。服务端任务仍会继续。` })
      }
    },
    async ensureSession(title) {
      if (get().activeId !== null) return get().activeId!
      creatingSession ??= client.createSession({ title: title.slice(0, 40) })
      let session: ChatSession
      try {
        session = await creatingSession
      } finally {
        creatingSession = null
      }
      ++revision
      set({
        activeId: session.id,
        messages: [],
        sessions: [session, ...get().sessions.filter((item) => item.id !== session.id)],
      })
      return session.id
    },
    async send(content, model, type = 'TEXT') {
      if (type !== 'TEXT') {
        set({ error: '图片和视频生成暂未开放，当前仅支持文字对话。' })
        return
      }
      if (!content.trim() || !model || get().sending || get().pending) return
      const id = get().activeId
      if (id === null) return
      const pending: PendingSend = {
        sessionId: id,
        command: { clientRequestId: uuid(), type, model, content: content.trim() },
      }
      savePending(pending)
      set({ pending })
      await get().retry()
    },
    async retry() {
      const pending = get().pending
      if (!pending || get().sending) return
      set({ sending: true, error: null })
      try {
        const accepted = await client.sendMessage(pending.sessionId, pending.command)
        savePending(null)
        if (get().activeId === pending.sessionId) {
          ++revision
          const ids = new Set([accepted.userMessage.id, accepted.assistantMessage.id])
          set({
            messages: [
              ...get().messages.filter((item) => !ids.has(item.id)),
              accepted.userMessage,
              accepted.assistantMessage,
            ],
          })
        }
        set({ pending: null, sending: false })
        void get().list()
      } catch (error) {
        set({
          sending: false,
          error: `发送受理状态未确认：${errorText(error)}。请使用原请求重试，避免重复生成。`,
        })
      }
    },
    async cancel(id) {
      try {
        const message = await client.cancelMessage(id)
        ++revision
        set({ messages: get().messages.map((item) => (item.id === message.id ? message : item)) })
      } catch (error) {
        set({ error: errorText(error) })
      }
    },
    async remove(id) {
      if (get().pending?.sessionId === id) {
        set({ error: '请先确认这条消息的受理状态，再删除会话。' })
        return
      }
      try {
        await client.deleteSession(id)
        set({ sessions: get().sessions.filter((item) => item.id !== id) })
        if (get().activeId === id) await get().open(null)
      } catch (error) {
        set({ error: errorText(error) })
      }
    },
  }))
}
export const chatStore = createChatStore(
  toolboxApi,
  () => crypto.randomUUID(),
  typeof sessionStorage === 'undefined' ? undefined : sessionStorage,
)
export const isActiveTask = (message: ChatMessage) =>
  message.role === 'ASSISTANT' && (message.status === 'PENDING' || message.status === 'RUNNING')
