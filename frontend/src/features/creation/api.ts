import api from '@/shared/api/client'

import type { Brief, Draft, GenerateRequest, Run, SaveRequest, Stage } from './types'

const root = '/creation/drafts'
export const creationApi = {
  list: () => api.get<never, Draft[]>(root),
  detail: (id: number) => api.get<never, Draft>(`${root}/${id}`),
  create: (payload: { requestId: string; brief: Brief }) => api.post<never, Draft>(root, payload),
  save: (id: number, payload: SaveRequest) => api.put<never, Draft>(`${root}/${id}`, payload),
  generate: (id: number, payload: GenerateRequest) =>
    api.post<never, Run>(`${root}/${id}/runs`, payload),
  adopt: (id: number, runId: number, revision: number) =>
    api.post<never, Draft>(`${root}/${id}/runs/${runId}/adopt`, { revision }),
  confirm: (id: number, revision: number, stage: Stage) =>
    api.post<never, Draft>(`${root}/${id}/confirm`, { revision, stage }),
  project: (id: number, payload: { revision: number; requestId: string }) =>
    api.post<never, { projectId: number }>(`${root}/${id}/project`, payload),
  export: (id: number) => api.get<never, Blob>(`${root}/${id}/export`, { responseType: 'blob' }),
}
