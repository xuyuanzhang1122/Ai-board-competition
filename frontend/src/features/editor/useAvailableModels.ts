import { useQuery } from '@tanstack/react-query'

import type { ModelType } from '@/shared/types/api'

import { modelApi } from './model-api'

export function useAvailableModels(type: ModelType) {
  const query = useQuery({
    queryFn: () => modelApi.getModels(type),
    queryKey: ['competition-editor-models-v1', type],
    staleTime: 5 * 60 * 1000,
  })
  return {
    error: query.error,
    loading: query.isLoading,
    models: query.data ?? [],
  }
}
