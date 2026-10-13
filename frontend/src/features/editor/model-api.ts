import api from '@/shared/api/client'
import type { ModelType, ModelVO } from '@/shared/types/api'

export const modelApi = {
  getModels(type: ModelType): Promise<ModelVO[]> {
    return api.get('/ai-models', { params: { type } })
  },
}
