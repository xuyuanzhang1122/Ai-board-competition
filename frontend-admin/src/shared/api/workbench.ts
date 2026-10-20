import { api, TOKEN_KEY } from './client'

export type KnowledgeStatus = 'DRAFT' | 'APPROVED' | 'REJECTED'
export interface KnowledgeFields {
  content: string
  factType: 'FACT' | 'LEGEND' | 'FICTION'
  license: string
  publishedOn: string | null
  sourceOrganization: string
  sourceUrl: string
  summary: string
  title: string
  topics: string
  validUntil: string | null
}
export interface Knowledge extends KnowledgeFields {
  collectedAt: string
  id: number
  reviewedAt: string | null
  reviewedBy: number | null
  reviewNote: string | null
  revision: number
  status: KnowledgeStatus
}
export interface PromptFields {
  capability: string
  changeNote: string
  content: string
  stage: string
  variables: string
}
export interface Prompt extends PromptFields {
  authorId: number | null
  createdAt: string
  publishedVersion: number
  status: 'DRAFT' | 'PUBLISHED' | 'DISABLED'
  version: number
}
export function workbenchApi(token: string) {
  const check = () => {
    if (!token || localStorage.getItem(TOKEN_KEY) !== token)
      throw new Error('登录状态已改变，请重新打开页面')
  }
  async function request<T>(
    method: 'get' | 'post' | 'put',
    path: string,
    data?: unknown,
  ): Promise<T> {
    check()
    const result = await api.request<never, T>({
      method,
      url: `/admin/workbench${path}`,
      data,
      headers: { Authorization: `Bearer ${token}` },
    })
    check()
    return result
  }
  return {
    listKnowledge: (query = '') =>
      request<Knowledge[]>('get', `/knowledge?query=${encodeURIComponent(query)}`),
    createKnowledge: (data: KnowledgeFields) => request<Knowledge>('post', '/knowledge', data),
    updateKnowledge: (id: number, data: KnowledgeFields & { revision: number }) =>
      request<Knowledge>('put', `/knowledge/${id}`, data),
    reviewKnowledge: (
      id: number,
      revision: number,
      status: 'APPROVED' | 'REJECTED',
      reviewNote: string,
    ) => request<Knowledge>('post', `/knowledge/${id}/review`, { revision, status, reviewNote }),
    listPrompts: () => request<Prompt[]>('get', '/prompts'),
    createPrompt: (data: PromptFields) => request<Prompt>('post', '/prompts', data),
    promptStatus: (
      stage: string,
      version: number,
      status: 'PUBLISHED' | 'DISABLED',
      expectedPublishedVersion: number,
    ) =>
      request<Prompt>('post', `/prompts/${encodeURIComponent(stage)}/${version}/status`, {
        status,
        expectedPublishedVersion,
      }),
  }
}
