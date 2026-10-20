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
  account: string | null
  activeId: number | null
  bindAccount: (account: string | null) => void
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
  retry: () => Promise<boolean>
  send: (content: string, model: string, type?: MessageType) => Promise<boolean>
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
  let account: string | null = null
  let authEpoch = 0
  let dataVersion = 0
  const readPending = (): PendingSend | null => {
    if (account === null) return null
    try {
      const saved = JSON.parse(
        storage?.getItem(`${pendingKey}:${account}`) || 'null',
      ) as PendingSend | null
      return saved?.sessionId && saved.command?.clientRequestId && saved.command.type === 'TEXT'
        ? saved
        : null
    } catch {
      return null
    }
  }
  try {
    storage?.removeItem(pendingKey)
  } catch {
    /* Retire unscoped legacy retry data. */
  }
  let revision = 0
  let creatingSession: Promise<ChatSession> | null = null
  const savePending = (value: PendingSend | null) => {
    if (account === null) return
    try {
      if (value) storage?.setItem(`${pendingKey}:${account}`, JSON.stringify(value))
      else storage?.removeItem(`${pendingKey}:${account}`)
    } catch {
      /* Retry remains available in memory. */
    }
  }
  return createStore<ChatState>((set, get) => ({
    account: null,
    bindAccount(next) {
      if (next === account) return
      account = next
      ++authEpoch
      ++revision
      ++dataVersion
      creatingSession = null
      set({
        account: next,
        sessions: [],
        activeId: null,
        messages: [],
        loading: false,
        sending: false,
        error: null,
        pending: readPending(),
      })
    },
    sessions: [],
    activeId: null,
    messages: [],
    loading: false,
    sending: false,
    error: null,
    pending: null,
    clearError: () => set({ error: null }),
    async list() {
      const scope = authEpoch
      try {
        const sessions = await client.getSessions()
        if (scope === authEpoch) set({ sessions })
      } catch (error) {
        if (scope === authEpoch) set({ error: errorText(error) })
      }
    },
    async open(id) {
      const token = ++revision
      const version = dataVersion
      set({ activeId: id, messages: [], loading: id !== null, error: null })
      if (id === null) return
      try {
        const detail = await client.getSession(id)
        if (token === revision)
          set({
            messages:
              version === dataVersion
                ? detail.messages
                : [
                    ...detail.messages,
                    ...get().messages.filter(
                      (item) => !detail.messages.some((saved) => saved.id === item.id),
                    ),
                  ],
            loading: false,
          })
      } catch (error) {
        if (token === revision) set({ loading: false, error: errorText(error) })
      }
    },
    async refresh() {
      const id = get().activeId
      const token = revision
      const version = dataVersion
      if (id === null || get().loading) return
      try {
        const detail = await client.getSession(id)
        if (id === get().activeId && token === revision && version === dataVersion)
          set({
            messages: detail.messages,
            error: get().error?.startsWith('更新会话失败') ? null : get().error,
          })
      } catch (error) {
        if (id === get().activeId && token === revision)
          set({ error: `更新会话失败：${errorText(error)}。服务端任务仍会继续。` })
      }
    },
    async ensureSession(title) {
      const scope = authEpoch
      if (get().activeId !== null) return get().activeId!
      creatingSession ??= client.createSession({ title: title.slice(0, 40) })
      let session: ChatSession
      try {
        session = await creatingSession
      } finally {
        if (scope === authEpoch) creatingSession = null
      }
      if (scope !== authEpoch) throw new Error('登录账户已变化，请重新发送')
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
        return false
      }
      if (!content.trim() || !model || get().sending || get().pending) return false
      const id = get().activeId
      if (id === null) return false
      const pending: PendingSend = {
        sessionId: id,
        command: { clientRequestId: uuid(), type, model, content: content.trim() },
      }
      savePending(pending)
      set({ pending })
      return get().retry()
    },
    async retry() {
      const scope = authEpoch
      const pending = get().pending
      if (!pending || get().sending) return false
      set({ sending: true, error: null })
      try {
        const accepted = await client.sendMessage(pending.sessionId, pending.command)
        if (scope !== authEpoch) return false
        savePending(null)
        if (get().activeId === pending.sessionId) {
          ++dataVersion
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
        return true
      } catch (error) {
        if (scope !== authEpoch) return false
        const code =
          error && typeof error === 'object' && 'code' in error ? Number(error.code) : null
        if (
          code !== null &&
          [40000, 40001, 40002, 40003, 40004, 40005, 40006, 50004].includes(code)
        ) {
          savePending(null)
          set({
            pending: null,
            sending: false,
            error: `消息未受理：${errorText(error)}。请调整后重新发送。`,
          })
          return false
        }
        set({
          sending: false,
          error: `发送受理状态未确认：${errorText(error)}。请使用原请求重试，避免重复生成。`,
        })
        return false
      }
    },
    async cancel(id) {
      const scope = authEpoch
      const sourceId = get().activeId
      try {
        const message = await client.cancelMessage(id)
        if (scope !== authEpoch || sourceId !== get().activeId) return
        ++dataVersion
        set({ messages: get().messages.map((item) => (item.id === message.id ? message : item)) })
      } catch (error) {
        if (scope === authEpoch) set({ error: errorText(error) })
      }
    },
    async remove(id) {
      const scope = authEpoch
      if (get().pending?.sessionId === id) {
        set({ error: '请先确认这条消息的受理状态，再删除会话。' })
        return
      }
      try {
        await client.deleteSession(id)
        if (scope !== authEpoch) return
        set({ sessions: get().sessions.filter((item) => item.id !== id) })
        if (get().activeId === id) await get().open(null)
      } catch (error) {
        if (scope === authEpoch) set({ error: errorText(error) })
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
