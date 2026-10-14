import api from '@/shared/api/client'
import { isAvailableOfficialTextModel } from '@/shared/constants/text-models'
import type { ModelType, ModelVO } from '@/shared/types/api'

export const modelApi = {
  async getModels(type: ModelType): Promise<ModelVO[]> {
    const models = await api.get<never, ModelVO[]>('/ai-models', { params: { type } })
    return type === 'LANGUAGE' ? models.filter(isAvailableOfficialTextModel) : models
  },
}
