import api, { type AccountRequestConfig, type AccountSession } from '@/shared/api/client'

import type { Brief, Draft, GenerateRequest, Run, SaveRequest, Stage } from './types'

const root = '/creation/drafts'
function forSession(session?: AccountSession) {
  const config: AccountRequestConfig | undefined = session
    ? { accountSession: { ...session } }
    : undefined
  return {
    list: () => api.get<never, Draft[]>(root, config),
    detail: (id: number) => api.get<never, Draft>(`${root}/${id}`, config),
    create: (payload: { requestId: string; brief: Brief }) =>
      api.post<never, Draft>(root, payload, config),
    save: (id: number, payload: SaveRequest) =>
      api.put<never, Draft>(`${root}/${id}`, payload, config),
    generate: (id: number, payload: GenerateRequest) =>
      api.post<never, Run>(`${root}/${id}/runs`, payload, config),
    adopt: (id: number, runId: number, revision: number) =>
      api.post<never, Draft>(`${root}/${id}/runs/${runId}/adopt`, { revision }, config),
    confirm: (id: number, revision: number, stage: Stage) =>
      api.post<never, Draft>(`${root}/${id}/confirm`, { revision, stage }, config),
    project: (id: number, payload: { revision: number; requestId: string }) =>
      api.post<never, { projectId: number }>(`${root}/${id}/project`, payload, config),
    export: (id: number) =>
      api.get<never, Blob>(`${root}/${id}/export`, { ...config, responseType: 'blob' }),
  }
}
export const creationApi = { ...forSession(), forSession }
