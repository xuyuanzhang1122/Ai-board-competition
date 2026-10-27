import api from '@/shared/api/client'
import type {
  AddPropToProjectDTO,
  AssetVersionVO,
  BatchGenerateRequest,
  BatchGenerateResponse,
  CharacterCategoryVO,
  CharacterLibraryVO,
  CreateCharacterCategoryDTO,
  CreateCharacterDTO,
  CreateCharacterLibraryDTO,
  CreatePropCategoryDTO,
  CreatePropLibraryDTO,
  CreateSceneCategoryDTO,
  CreateSceneDTO,
  CreateSceneLibraryDTO,
  ExportRequest,
  ExportResponse,
  GenerateCharacterDTO,
  GeneratePropDTO,
  GenerateSceneDTO,
  ImportSummary,
  JobVO,
  PageResult,
  ProjectCharacterVO,
  ProjectPropVO,
  ProjectSceneVO,
  PropCategoryVO,
  PropLibraryVO,
  SceneCategoryVO,
  SceneLibraryVO,
  SetCurrentVersionRequest,
  StoryboardShotVO,
  UpdateCharacterCategoryDTO,
  UpdateCharacterDTO,
  UpdateCharacterLibraryDTO,
  UpdatePropCategoryDTO,
  UpdatePropDTO,
  UpdatePropLibraryDTO,
  UpdateSceneCategoryDTO,
  UpdateSceneDTO,
  UpdateSceneLibraryDTO,
} from '@/shared/types/api'

export type GenerationParams = {
  aspectRatio?: '1:1' | '16:9' | '9:16' | '21:9' | '4:3' | '3:4' | '3:2' | '2:3'
  duration?: number
  model?: string
}

export type ShotGenerationParams = GenerationParams & {
  customPrompt?: string
  referenceImageUrl?: string
  referenceImageUrls?: string[]
}

export interface ShotVideoAssetResource {
  id: number
  name: string
  thumbnailUrl: string
}

export interface ShotVideoGenerationRequest {
  aspectRatio: string
  characters: ShotVideoAssetResource[]
  duration: number
  model: string
  prompt: string
  props: ShotVideoAssetResource[]
  referenceImageUrl?: string
  scene: ShotVideoAssetResource | null
  size: string
}

export const shotApi = {
  createBinding(
    projectId: number,
    shotId: number,
    bindType: 'PCHAR' | 'PSCENE' | 'PPROP',
    bindId: number,
  ): Promise<void> {
    return api.post(`/projects/${projectId}/shots/${shotId}/bindings`, { bindType, bindId })
  },

  createShot(projectId: number, scriptText: string): Promise<StoryboardShotVO> {
    return api.post(`/projects/${projectId}/shots`, { scriptText })
  },

  deleteBinding(projectId: number, shotId: number, bindingId: number): Promise<void> {
    return api.delete(`/projects/${projectId}/shots/${shotId}/bindings/${bindingId}`)
  },

  deleteShot(projectId: number, shotId: number): Promise<void> {
    return api.delete(`/projects/${projectId}/shots/${shotId}`)
  },

  deleteShotAsset(
    projectId: number,
    shotId: number,
    assetType: 'shot-image' | 'video',
  ): Promise<void> {
    return api.delete(`/projects/${projectId}/shots/${shotId}/assets/${assetType}`)
  },

  getProjectShots(projectId: number, ids?: number[]): Promise<StoryboardShotVO[]> {
    // ids 非空时只拉取这些分镜（定点刷新），否则拉全量。
    const query = ids && ids.length > 0 ? `?ids=${ids.join(',')}` : ''
    return api.get(`/projects/${projectId}/shots${query}`)
  },

  parseAndCreateShots(
    projectId: number,
    fullScript: string,
    signal?: AbortSignal,
  ): Promise<StoryboardShotVO[]> {
    return api.post(
      `/projects/${projectId}/shots/parse-script`,
      { fullScript },
      { signal, timeout: 120_000 },
    )
  },

  reorderShots(projectId: number, shotIds: number[]): Promise<void> {
    return api.put(`/projects/${projectId}/shots/reorder`, { shotIds })
  },

  updateShot(projectId: number, shotId: number, scriptText: string): Promise<void> {
    return api.put(`/projects/${projectId}/shots/${shotId}`, { scriptText })
  },
}

export const characterApi = {
  createCategory(data: CreateCharacterCategoryDTO): Promise<CharacterCategoryVO> {
    return api.post('/character-categories', data)
  },
  createCharacter(projectId: number, data: CreateCharacterDTO): Promise<ProjectCharacterVO> {
    return api.post(`/projects/${projectId}/characters`, data)
  },
  createFromLibrary(projectId: number, libraryCharacterId: number): Promise<ProjectCharacterVO> {
    return api.post(`/projects/${projectId}/characters`, {
      characterLibraryId: libraryCharacterId,
      description: '',
      name: '',
    })
  },
  createLibraryCharacter(data: CreateCharacterLibraryDTO): Promise<CharacterLibraryVO> {
    return api.post('/library/characters', data)
  },
  deleteCategory(categoryId: number): Promise<void> {
    return api.delete(`/character-categories/${categoryId}`)
  },
  deleteCharacter(projectId: number, characterId: number): Promise<void> {
    return api.delete(`/projects/${projectId}/characters/${characterId}`)
  },
  deleteLibraryCharacter(characterId: number): Promise<void> {
    return api.delete(`/library/characters/${characterId}`)
  },
  generateCharacter(
    projectId: number,
    characterId: number,
    data: GenerateCharacterDTO,
  ): Promise<{ jobId: number }> {
    return api.post(`/projects/${projectId}/generate/character/${characterId}`, data)
  },
  getCharacter(projectId: number, characterId: number): Promise<ProjectCharacterVO> {
    return api.get(`/projects/${projectId}/characters/${characterId}`)
  },
  getCharacterCategories(): Promise<CharacterCategoryVO[]> {
    return api.get('/library/characters/categories')
  },
  getLibraryCharacters(categoryId?: number): Promise<CharacterLibraryVO[]> {
    return api.get('/library/characters', { params: categoryId ? { categoryId } : {} })
  },
  getProjectCharacters(projectId: number): Promise<ProjectCharacterVO[]> {
    return api.get(`/projects/${projectId}/characters`)
  },
  updateCategory(categoryId: number, data: UpdateCharacterCategoryDTO): Promise<void> {
    return api.put(`/character-categories/${categoryId}`, data)
  },
  updateCharacter(
    projectId: number,
    characterId: number,
    data: UpdateCharacterDTO,
  ): Promise<ProjectCharacterVO> {
    return api.put(`/projects/${projectId}/characters/${characterId}`, data)
  },
  updateLibraryCharacter(characterId: number, data: UpdateCharacterLibraryDTO): Promise<void> {
    return api.put(`/library/characters/${characterId}`, data)
  },
  uploadLibraryCharacterThumbnail(characterId: number, file: File): Promise<{ url: string }> {
    const formData = new FormData()
    formData.append('file', file)
    return api.post(`/library/characters/${characterId}/thumbnail`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}

export const sceneApi = {
  createCategory(data: CreateSceneCategoryDTO): Promise<SceneCategoryVO> {
    return api.post('/scene-categories', data)
  },
  createFromLibrary(projectId: number, librarySceneId: number): Promise<ProjectSceneVO> {
    return api.post(`/projects/${projectId}/scenes`, {
      description: '',
      name: '',
      sceneLibraryId: librarySceneId,
    })
  },
  createLibraryScene(data: CreateSceneLibraryDTO): Promise<SceneLibraryVO> {
    return api.post('/library/scenes', data)
  },
  createScene(projectId: number, data: CreateSceneDTO): Promise<ProjectSceneVO> {
    return api.post(`/projects/${projectId}/scenes`, data)
  },
  deleteCategory(categoryId: number): Promise<void> {
    return api.delete(`/scene-categories/${categoryId}`)
  },
  deleteLibraryScene(sceneId: number): Promise<void> {
    return api.delete(`/library/scenes/${sceneId}`)
  },
  deleteScene(projectId: number, sceneId: number): Promise<void> {
    return api.delete(`/projects/${projectId}/scenes/${sceneId}`)
  },
  generateScene(
    projectId: number,
    sceneId: number,
    data: GenerateSceneDTO,
  ): Promise<{ jobId: number }> {
    return api.post(`/projects/${projectId}/generate/scene/${sceneId}`, data)
  },
  getLibraryScenes(categoryId?: number): Promise<SceneLibraryVO[]> {
    return api.get('/library/scenes', { params: categoryId ? { categoryId } : {} })
  },
  getProjectScenes(projectId: number): Promise<ProjectSceneVO[]> {
    return api.get(`/projects/${projectId}/scenes`)
  },
  getScene(projectId: number, sceneId: number): Promise<ProjectSceneVO> {
    return api.get(`/projects/${projectId}/scenes/${sceneId}`)
  },
  getSceneCategories(): Promise<SceneCategoryVO[]> {
    return api.get('/library/scenes/categories')
  },
  updateCategory(categoryId: number, data: UpdateSceneCategoryDTO): Promise<void> {
    return api.put(`/scene-categories/${categoryId}`, data)
  },
  updateLibraryScene(sceneId: number, data: UpdateSceneLibraryDTO): Promise<void> {
    return api.put(`/library/scenes/${sceneId}`, data)
  },
  updateScene(projectId: number, sceneId: number, data: UpdateSceneDTO): Promise<ProjectSceneVO> {
    return api.put(`/projects/${projectId}/scenes/${sceneId}`, data)
  },
}

export const propApi = {
  addPropToProject(projectId: number, data: AddPropToProjectDTO): Promise<ProjectPropVO> {
    return api.post(`/projects/${projectId}/props`, data)
  },
  createCategory(data: CreatePropCategoryDTO): Promise<PropCategoryVO> {
    return api.post('/library/props/categories', data)
  },
  createFromLibrary(projectId: number, libraryPropId: number): Promise<ProjectPropVO> {
    return api.post(`/projects/${projectId}/props`, { libraryPropId })
  },
  createLibraryProp(data: CreatePropLibraryDTO): Promise<PropLibraryVO> {
    return api.post('/library/props', data)
  },
  deleteCategory(categoryId: number): Promise<void> {
    return api.delete(`/library/props/categories/${categoryId}`)
  },
  deleteLibraryProp(propId: number): Promise<void> {
    return api.delete(`/library/props/${propId}`)
  },
  deleteProp(projectId: number, propId: number): Promise<void> {
    return api.delete(`/projects/${projectId}/props/${propId}`)
  },
  generateProp(
    projectId: number,
    propId: number,
    data: GeneratePropDTO,
  ): Promise<{ jobId: number }> {
    return api.post(`/projects/${projectId}/generate/prop/${propId}`, data)
  },
  getLibraryProps(categoryId?: number): Promise<PropLibraryVO[]> {
    return api.get('/library/props', { params: categoryId ? { categoryId } : {} })
  },
  getProjectProps(projectId: number): Promise<ProjectPropVO[]> {
    return api.get(`/projects/${projectId}/props`)
  },
  getProp(projectId: number, propId: number): Promise<ProjectPropVO> {
    return api.get(`/projects/${projectId}/props/${propId}`)
  },
  getPropCategories(): Promise<PropCategoryVO[]> {
    return api.get('/library/props/categories')
  },
  updateCategory(categoryId: number, data: UpdatePropCategoryDTO): Promise<void> {
    return api.put(`/library/props/categories/${categoryId}`, data)
  },
  updateLibraryProp(propId: number, data: UpdatePropLibraryDTO): Promise<void> {
    return api.put(`/library/props/${propId}`, data)
  },
  updateProp(projectId: number, propId: number, data: UpdatePropDTO): Promise<ProjectPropVO> {
    return api.put(`/projects/${projectId}/props/${propId}`, data)
  },
}

const withQuery = (path: string, params: ShotGenerationParams) => {
  const queryParams = new URLSearchParams()
  if (params.aspectRatio) queryParams.append('aspectRatio', params.aspectRatio)
  if (params.model) queryParams.append('model', params.model)
  if (params.customPrompt) queryParams.append('customPrompt', params.customPrompt)
  params.referenceImageUrls?.forEach((url) => queryParams.append('referenceImageUrls', url))
  if (params.referenceImageUrl) queryParams.append('referenceImageUrl', params.referenceImageUrl)
  const query = queryParams.toString()
  return query ? `${path}?${query}` : path
}

export const generationApi = {
  generateCharactersBatch(
    projectId: number,
    request: BatchGenerateRequest,
  ): Promise<BatchGenerateResponse> {
    return api.post(`/projects/${projectId}/generate/characters`, request)
  },
  generateScenesBatch(
    projectId: number,
    request: BatchGenerateRequest,
  ): Promise<BatchGenerateResponse> {
    return api.post(`/projects/${projectId}/generate/scenes`, request)
  },
  generateShotsBatch(
    projectId: number,
    request: BatchGenerateRequest,
  ): Promise<BatchGenerateResponse> {
    return api.post(`/projects/${projectId}/generate/shots`, request)
  },
  generateSingleCharacter(
    projectId: number,
    characterId: number,
    params: GenerationParams,
  ): Promise<BatchGenerateResponse> {
    return api.post(withQuery(`/projects/${projectId}/generate/character/${characterId}`, params))
  },
  generateSingleProp(
    projectId: number,
    propId: number,
    params: GenerationParams,
  ): Promise<BatchGenerateResponse> {
    return api.post(withQuery(`/projects/${projectId}/generate/prop/${propId}`, params))
  },
  generateSingleScene(
    projectId: number,
    sceneId: number,
    params: GenerationParams,
  ): Promise<BatchGenerateResponse> {
    return api.post(withQuery(`/projects/${projectId}/generate/scene/${sceneId}`, params))
  },
  generateSingleShot(
    projectId: number,
    shotId: number,
    params: ShotGenerationParams,
  ): Promise<BatchGenerateResponse> {
    return api.post(withQuery(`/projects/${projectId}/generate/shot/${shotId}`, params))
  },
  generateSingleShotVideo(
    projectId: number,
    shotId: number,
    request: ShotVideoGenerationRequest,
  ): Promise<BatchGenerateResponse> {
    return api.post(`/projects/${projectId}/generate/shot-video/${shotId}`, request)
  },
  generateSingleVideo(
    projectId: number,
    shotId: number,
    params: GenerationParams,
  ): Promise<BatchGenerateResponse> {
    return api.post(`/projects/${projectId}/generate/video/${shotId}`, params)
  },
  generateVideosBatch(
    projectId: number,
    request: BatchGenerateRequest,
  ): Promise<BatchGenerateResponse> {
    return api.post(`/projects/${projectId}/generate/videos`, request)
  },
}

export const assetApi = {
  downloadAsset(url: string): Promise<Blob> {
    return api.post('/assets/download-from-url', { url }, { responseType: 'blob' }) as unknown as Promise<Blob>
  },
  getAssetVersions(assetId: number): Promise<AssetVersionVO[]> {
    return api.get(`/assets/${assetId}/versions`)
  },
  setCurrentVersion(assetId: number, request: SetCurrentVersionRequest): Promise<void> {
    return api.put(`/assets/${assetId}/current`, request)
  },
  uploadFromUrl(assetId: number, imageUrl: string): Promise<AssetVersionVO> {
    return api.post(`/assets/${assetId}/versions/upload-from-url`, null, { params: { imageUrl } })
  },
  uploadNewVersion(assetId: number, file: File): Promise<AssetVersionVO> {
    const formData = new FormData()
    formData.append('file', file)
    return api.post(`/assets/${assetId}/versions/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}

export const textGenerationApi = {
  describeAsset(
    data: { assetType: 'character' | 'scene' | 'prop'; assetName: string; sourceText: string },
    projectId: number,
    options?: { model?: string },
  ): Promise<{ text: string }> {
    return api.post('/generate/asset-description', { ...data, projectId, model: options?.model }, { timeout: 120_000 })
  },
  generateText(
    prompt: string,
    projectId: number,
    options?: { model?: string; temperature?: number; topP?: number },
  ): Promise<{ text: string }> {
    return api.post(
      '/generate/text',
      {
        model: options?.model,
        projectId,
        prompt,
        temperature: options?.temperature,
        topP: options?.topP,
      },
      { timeout: 120_000 },
    )
  },
}

export const jobApi = {
  cancelJob(jobId: number): Promise<void> {
    return api.post(`/jobs/${jobId}/cancel`)
  },
  getJobStatus(jobId: number): Promise<JobVO> {
    return api.get(`/jobs/${jobId}`)
  },
  getUserJobs(params: {
    jobType?: string
    page: number
    projectId?: number
    size: number
    status?: 'CANCELED' | 'FAILED' | 'PENDING' | 'RUNNING' | 'SUCCEEDED'
  }): Promise<PageResult<JobVO>> {
    return api.get('/jobs', { params })
  },
}

export const imageUtilApi = {
  mergeImages(imageUrls: string[]): Promise<{ mergedImageUrl: string }> {
    return api.post('/utils/images/merge', { imageUrls })
  },
}

export const pollJobStatus = async (
  jobId: number,
  onProgress?: (job: JobVO) => void,
  interval = 3000,
): Promise<JobVO> =>
  new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const job = await jobApi.getJobStatus(jobId)
        onProgress?.(job)
        if (job.status === 'SUCCEEDED' || job.status === 'COMPLETED') resolve(job)
        else if (job.status === 'FAILED') reject(new Error(job.errorMessage || 'Job failed'))
        else setTimeout(poll, interval)
      } catch (error) {
        reject(error)
      }
    }
    void poll()
  })

const appendAssetFiles = (formData: FormData, files: File[]) => {
  files.forEach((file) => {
    const uploadName = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
    formData.append('assetFiles', file, uploadName)
  })
}

export const importApi = {
  importAssetImages(projectId: number, assetFiles: File[]): Promise<ImportSummary> {
    const formData = new FormData()
    appendAssetFiles(formData, assetFiles)
    return api.post(`/projects/${projectId}/import/asset-images`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300_000,
    })
  },
  importStoryboardExcel(
    projectId: number,
    file: File,
    assetFiles: File[] = [],
  ): Promise<ImportSummary> {
    const formData = new FormData()
    formData.append('file', file)
    appendAssetFiles(formData, assetFiles)
    return api.post(`/projects/${projectId}/import/excel`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300_000,
    })
  },
}

export const exportApi = {
  downloadExportFile: async (jobId: number): Promise<void> => {
    const baseURL = api.defaults.baseURL || '/api'
    const token = localStorage.getItem('token')
    const response = await fetch(`${baseURL}/exports/${jobId}/download`, {
      headers: { Authorization: `Bearer ${token}` },
      method: 'GET',
    })
    if (!response.ok) throw new Error(`下载失败: ${response.status} ${response.statusText}`)

    const downloadUrl = window.URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = `project_export_${jobId}.zip`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(downloadUrl)
  },
  getDownloadUrl(jobId: number): string {
    const baseURL = api.defaults.baseURL || '/api'
    return `${baseURL}/exports/${jobId}/download?token=${localStorage.getItem('token')}`
  },
  submitExportTask(projectId: number, request: ExportRequest): Promise<ExportResponse> {
    return api.post(`/projects/${projectId}/export`, request)
  },
}
