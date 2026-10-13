import type { AssetVersionVO, BatchGenerateRequest } from '@/shared/types/api'

import type {
  AssetGenerateDialogRequest,
  AssetVersionDialogRequest,
} from '../storyboard/StoryboardRow'

export const ASSET_GENERATION_ASPECT_RATIOS = [
  '1:1',
  '16:9',
  '9:16',
  '21:9',
  '4:3',
  '3:4',
  '3:2',
  '2:3',
] as const
export type AssetGenerationAspectRatio = (typeof ASSET_GENERATION_ASPECT_RATIOS)[number]

export interface AssetGenerationFormState {
  aspectRatio: AssetGenerationAspectRatio
  count: number
  duration: number
  model: string
}

export type AssetGenerationFormAction =
  | { aspectRatio: AssetGenerationAspectRatio; type: 'set-aspect-ratio' }
  | { assetType: AssetGenerateDialogRequest['assetType']; configuredModel?: string; type: 'reset' }
  | { count: number; type: 'set-count' }
  | { duration: number; type: 'set-duration' }
  | { model: string; type: 'set-model' }

export function createAssetGenerationFormState(
  _assetType: AssetGenerateDialogRequest['assetType'],
  configuredModel?: string,
): AssetGenerationFormState {
  return {
    aspectRatio: '16:9',
    count: 1,
    duration: 5,
    model: configuredModel || '',
  }
}

export function assetGenerationFormReducer(
  state: AssetGenerationFormState,
  action: AssetGenerationFormAction,
): AssetGenerationFormState {
  switch (action.type) {
    case 'reset': {
      return createAssetGenerationFormState(action.assetType, action.configuredModel)
    }
    case 'set-aspect-ratio': {
      return { ...state, aspectRatio: action.aspectRatio }
    }
    case 'set-count': {
      return { ...state, count: Math.max(1, Math.min(10, Math.trunc(action.count || 1))) }
    }
    case 'set-duration': {
      return { ...state, duration: Math.max(1, Math.min(15, Math.trunc(action.duration || 5))) }
    }
    case 'set-model': {
      return { ...state, model: action.model }
    }
  }
}

export function calculateAssetGenerationCost(
  assetType: AssetGenerateDialogRequest['assetType'],
  count: number,
): number {
  return (assetType === 'video' ? 100 : 50) * Math.max(1, Math.trunc(count || 1))
}

export function buildAssetGenerationRequest(
  request: AssetGenerateDialogRequest,
  form: AssetGenerationFormState,
): BatchGenerateRequest {
  return {
    aspectRatio: form.aspectRatio,
    countPerItem: form.count,
    ...(request.assetType === 'video' ? { duration: form.duration } : {}),
    mode: 'ALL',
    model: form.model,
    targetIds: [request.shotId],
  }
}

export interface AssetVersionModalState {
  error: string | null
  loading: boolean
  selectedVersionId: number | null
  switching: boolean
  versions: AssetVersionVO[]
}

export type AssetVersionModalAction =
  | { message: string; type: 'load-error' }
  | { type: 'load-start' }
  | { type: 'reset' }
  | { type: 'switch-finish' }
  | { type: 'switch-start'; versionId: number }
  | { type: 'versions-loaded'; versions: AssetVersionVO[] }

export const createAssetVersionModalState = (): AssetVersionModalState => ({
  error: null,
  loading: false,
  selectedVersionId: null,
  switching: false,
  versions: [],
})

export function sortAssetVersions(versions: AssetVersionVO[]): AssetVersionVO[] {
  return [...versions].sort((left, right) => right.versionNo - left.versionNo)
}

export function assetVersionModalReducer(
  state: AssetVersionModalState,
  action: AssetVersionModalAction,
): AssetVersionModalState {
  switch (action.type) {
    case 'load-start': {
      return { ...createAssetVersionModalState(), loading: true }
    }
    case 'versions-loaded': {
      return { ...state, loading: false, versions: sortAssetVersions(action.versions) }
    }
    case 'load-error': {
      return {
        ...state,
        error: action.message,
        loading: false,
        selectedVersionId: null,
        switching: false,
      }
    }
    case 'switch-start': {
      return { ...state, error: null, selectedVersionId: action.versionId, switching: true }
    }
    case 'switch-finish': {
      return { ...state, selectedVersionId: null, switching: false }
    }
    case 'reset': {
      return createAssetVersionModalState()
    }
  }
}

export function assetVersionDownloadName(request: AssetVersionDialogRequest, versionNo: number) {
  const extension = request.assetType === 'video' ? 'mp4' : 'jpg'
  return `shot_${request.shotId}_v${versionNo}.${extension}`
}
