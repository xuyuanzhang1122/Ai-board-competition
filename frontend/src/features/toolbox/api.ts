import api from '@/shared/api/client'
import type {
  JobVO,
  ToolboxGenerateRequest,
  ToolboxGenerateResponse,
  ToolboxHistoryVO,
  ToolboxSessionVO,
} from '@/shared/types/api'

export interface AiModelVO {
  code: string
  enabled: number
  id: number
  name: string
  provider: string
  type: 'LANGUAGE' | 'IMAGE' | 'VIDEO'
}

interface ToolboxHistoryBackendItem extends Omit<ToolboxHistoryVO, 'prompt' | 'text'> {
  inputPrompt?: string | null
  prompt?: string | null
  resultContent?: string | null
  text?: string | null
}

interface ToolboxHistoryPage {
  records?: ToolboxHistoryBackendItem[]
}

export const toolboxApi = {
  /**
   * Generate content (text/image/video) in toolbox.
   * Image/video generation initialization and long text responses may take up to three minutes.
   */
  generate(data: ToolboxGenerateRequest): Promise<ToolboxGenerateResponse> {
    return api.post('/toolbox/generate', data, { timeout: 180_000 })
  },

  /** Get toolbox generation history (last 7 days). */
  async getHistory(params?: { page?: number; size?: number }): Promise<ToolboxHistoryVO[]> {
    const response = await api.get<never, ToolboxHistoryPage>('/toolbox/history', {
      params: {
        page: params?.page || 1,
        size: params?.size || 100,
      },
    })

    // Backend returns PageResult. Preserve its historical field aliases for deployed versions.
    const records = response.records || []
    return records.map(
      (item) =>
        ({
          ...item,
          text: item.resultContent || item.text || null,
          resultUrl: item.resultUrl || null,
          prompt: item.inputPrompt || item.prompt || null,
        }) as ToolboxHistoryVO,
    )
  },

  deleteHistory(id: number): Promise<void> {
    return api.delete(`/toolbox/history/${id}`)
  },

  saveToAssets(id: number): Promise<void> {
    return api.post(`/toolbox/history/${id}/save`)
  },

  getModels(type: 'TEXT' | 'IMAGE' | 'VIDEO'): Promise<AiModelVO[]> {
    const backendType = type === 'TEXT' ? 'LANGUAGE' : type
    return api.get<never, AiModelVO[]>('/ai-models', {
      params: { type: backendType },
    })
  },

  getSessions(): Promise<ToolboxSessionVO[]> {
    return api.get('/toolbox/sessions')
  },

  createSession(data: {
    title: string
    conversationsJson: string
  }): Promise<ToolboxSessionVO> {
    return api.post('/toolbox/sessions', data)
  },

  updateSession(
    id: number,
    data: { title: string; conversationsJson: string },
  ): Promise<ToolboxSessionVO> {
    return api.put(`/toolbox/sessions/${id}`, data)
  },

  deleteSession(id: number): Promise<void> {
    return api.delete(`/toolbox/sessions/${id}`)
  },
}

export const jobApi = {
  getJobStatus(jobId: number): Promise<JobVO> {
    return api.get(`/jobs/${jobId}`)
  },
}
