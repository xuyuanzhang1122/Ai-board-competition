import api from '@/shared/api/client'

export type MessageType = 'TEXT' | 'IMAGE' | 'VIDEO'
export type MessageStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED'
export interface ChatSession {
  createdAt: string
  id: number
  title: string
  updatedAt: string
}
export interface ChatMessage {
  content: string
  createdAt: string
  errorMessage: string | null
  id: number
  jobId: number | null
  model: string | null
  resultUrl: string | null
  role: 'USER' | 'ASSISTANT'
  status: MessageStatus
  type: MessageType
}
export interface SessionDetail {
  messages: ChatMessage[]
  session: ChatSession
}
export interface SendCommand {
  aspectRatio?: string
  clientRequestId: string
  content: string
  model: string
  type: MessageType
}
export interface AcceptedMessage {
  assistantMessage: ChatMessage
  jobId: number
  userMessage: ChatMessage
}
const base = '/toolbox/chat'
export const toolboxApi = {
  getSessions(): Promise<ChatSession[]> {
    return api.get(`${base}/sessions`)
  },
  createSession(data: { title?: string } = {}): Promise<ChatSession> {
    return api.post(`${base}/sessions`, data)
  },
  getSession(id: number): Promise<SessionDetail> {
    return api.get(`${base}/sessions/${id}`)
  },
  sendMessage(id: number, command: SendCommand): Promise<AcceptedMessage> {
    return api.post(`${base}/sessions/${id}/messages`, command)
  },
  cancelMessage(id: number): Promise<ChatMessage> {
    return api.post(`${base}/messages/${id}/cancel`)
  },
  deleteSession(id: number): Promise<void> {
    return api.delete(`${base}/sessions/${id}`)
  },
}
