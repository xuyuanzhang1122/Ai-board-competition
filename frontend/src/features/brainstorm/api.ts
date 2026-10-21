import api, { type AccountRequestConfig, type AccountSession } from '@/shared/api/client'

import type { Brief } from '../creation/types'
import type { Brainstorm, Outline, Run } from './types'

export function forSession(session: AccountSession) {
  const config: AccountRequestConfig = { accountSession: { ...session } }
  const root = '/brainstorms'
  return {
    list: () => api.get<never, Brainstorm[]>(root, config),
    detail: (id: number) => api.get<never, Brainstorm>(`${root}/${id}`, config),
    create: (payload: { requestId: string; brief: Brief }) => api.post<never, Brainstorm>(root, payload, config),
    save: (id: number, payload: { revision: number; brief: Brief; outline: Outline | null }) => api.put<never, Brainstorm>(`${root}/${id}`, payload, config),
    run: (id: number, payload: { requestId: string; revision: number; model: string }) => api.post<never, Run>(`${root}/${id}/runs`, payload, config),
    adopt: (id: number, runId: number, revision: number) => api.post<never, Brainstorm>(`${root}/${id}/runs/${runId}/adopt`, { revision }, config),
    confirm: (id: number, revision: number) => api.post<never, Brainstorm>(`${root}/${id}/confirm`, { revision }, config),
    handoff: (id: number, payload: { revision: number; requestId: string }) => api.post<never, { draftId: number }>(`${root}/${id}/creation`, payload, config),
    export: (id: number) => api.get<never, unknown>(`${root}/${id}/export`, config),
    knowledge: (query: string) => api.get<never, Knowledge[]>('/workbench/knowledge', { ...config, params: { query } }),
  }
}
export interface Knowledge {
  content: string
  factType: 'FACT' | 'LEGEND' | 'FICTION'
  id: number
  license: string
  revision: number
  sourceOrganization: string
  sourceUrl: string
  status: string
  title: string
  validUntil: string | null
}
