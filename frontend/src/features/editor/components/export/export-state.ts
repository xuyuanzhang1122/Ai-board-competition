import type { ExportRequest, JobVO, StoryboardShotVO } from '@/shared/types/api'

import { exportApi, jobApi } from '../../api'

export interface ExportFormState {
  exportCharacters: boolean
  exportScenes: boolean
  exportShotImages: boolean
  exportVideos: boolean
  mode: 'CURRENT' | 'ALL'
}

export type ExportFormAction =
  | { field: keyof Omit<ExportFormState, 'mode'>; type: 'toggle' }
  | { mode: 'CURRENT' | 'ALL'; type: 'set-mode' }
  | { type: 'reset' }

export const createInitialExportFormState = (): ExportFormState => ({
  exportCharacters: true,
  exportScenes: true,
  exportShotImages: true,
  exportVideos: true,
  mode: 'CURRENT',
})

export function exportFormReducer(
  state: ExportFormState,
  action: ExportFormAction,
): ExportFormState {
  switch (action.type) {
    case 'toggle': {
      return { ...state, [action.field]: !state[action.field] }
    }
    case 'set-mode': {
      return { ...state, mode: action.mode }
    }
    case 'reset': {
      return createInitialExportFormState()
    }
  }
}

export const hasExportSelection = (state: ExportFormState): boolean =>
  state.exportCharacters || state.exportScenes || state.exportShotImages || state.exportVideos

/**
 * 按后端 ExportRequest 契约构造 payload。
 *
 * 注意:后端 `ExportRequest` 目前仅接受四个布尔开关与 mode,不包含分镜 ID 列表。
 * CURRENT/ALL 指资产版本范围(当前版本/所有历史版本),而非分镜选择范围。
 */
export function buildExportRequest(state: ExportFormState): ExportRequest {
  return {
    exportCharacters: state.exportCharacters,
    exportScenes: state.exportScenes,
    exportShotImages: state.exportShotImages,
    exportVideos: state.exportVideos,
    mode: state.mode,
  }
}

export async function submitExportTask(
  projectId: number,
  request: ExportRequest,
): Promise<number> {
  const response = await exportApi.submitExportTask(projectId, request)
  return response.jobId
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function pollExportJob(
  jobId: number,
  onProgress: (job: JobVO) => void,
  signal: AbortSignal,
  interval = 3000,
): Promise<JobVO> {
  while (true) {
    if (signal.aborted) throw new Error('导出任务已取消')
    await sleep(interval)
    if (signal.aborted) throw new Error('导出任务已取消')

    const job = await jobApi.getJobStatus(jobId)
    onProgress(job)

    if (job.status === 'SUCCEEDED' || job.status === 'COMPLETED') return job
    if (job.status === 'FAILED') throw new Error(job.errorMessage || '导出失败')
  }
}

export interface AssetDownloadItem {
  filename: string
  type: string
  url: string
}

export function extractExtension(url: string, fallback: string): string {
  try {
    const pathname = new URL(url).pathname
    const lastDot = pathname.lastIndexOf('.')
    const lastSlash = pathname.lastIndexOf('/')
    if (lastDot > lastSlash && lastDot !== -1) {
      const ext = pathname.slice(lastDot + 1)
      if (ext) return ext
    }
  } catch {
    // URL 解析失败时使用 fallback
  }
  return fallback
}

export function collectReadyAssets(
  shots: StoryboardShotVO[],
  options?: { shotIds?: Set<number> },
): AssetDownloadItem[] {
  const assets: AssetDownloadItem[] = []
  for (const shot of shots) {
    if (options?.shotIds && !options.shotIds.has(shot.id)) continue

    if (shot.shotImage.status === 'READY' && shot.shotImage.currentUrl) {
      assets.push({
        url: shot.shotImage.currentUrl,
        filename: `分镜${shot.shotNo}_图片.${extractExtension(shot.shotImage.currentUrl, 'jpg')}`,
        type: '分镜图',
      })
    }
    if (shot.video.status === 'READY' && shot.video.currentUrl) {
      assets.push({
        url: shot.video.currentUrl,
        filename: `分镜${shot.shotNo}_视频.${extractExtension(shot.video.currentUrl, 'mp4')}`,
        type: '视频',
      })
    }
  }
  return assets
}

export interface DownloadEnvironment {
  clickDownloadLink: (url: string, filename: string) => void
  createObjectURL: (blob: Blob) => string
  fetchBlob: (url: string) => Promise<Blob>
  revokeObjectURL: (url: string) => void
}

export const defaultDownloadEnvironment: DownloadEnvironment = {
  clickDownloadLink: (url: string, filename: string) => {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  },
  createObjectURL: (blob: Blob) => window.URL.createObjectURL(blob),
  fetchBlob: async (url: string) => {
    const response = await fetch(url, { method: 'GET' })
    if (!response.ok) throw new Error(`下载失败: ${response.status} ${response.statusText}`)
    return response.blob()
  },
  revokeObjectURL: (url: string) => window.URL.revokeObjectURL(url),
}

export async function downloadAssetFile(
  item: AssetDownloadItem,
  env: DownloadEnvironment = defaultDownloadEnvironment,
): Promise<void> {
  try {
    const blob = await env.fetchBlob(item.url)
    const objectUrl = env.createObjectURL(blob)
    try {
      env.clickDownloadLink(objectUrl, item.filename)
    } finally {
      env.revokeObjectURL(objectUrl)
    }
  } catch {
    // 跨域/非 CORS 资源 fallback:直接让浏览器处理下载链接
    env.clickDownloadLink(item.url, item.filename)
  }
}

export interface DownloadAssetsOptions {
  delayMs?: number
  onResult?: (success: number, fail: number) => void
}

export async function downloadAssetsSequentially(
  items: AssetDownloadItem[],
  env: DownloadEnvironment = defaultDownloadEnvironment,
  options: DownloadAssetsOptions = {},
): Promise<{ fail: number; success: number }> {
  const { delayMs = 300, onResult } = options
  let success = 0
  let fail = 0

  for (const item of items) {
    try {
      await downloadAssetFile(item, env)
      success++
    } catch {
      fail++
    }
    if (delayMs > 0) await sleep(delayMs)
  }

  onResult?.(success, fail)
  return { success, fail }
}

export function buildScriptContent(
  shots: StoryboardShotVO[],
  projectName: string,
): string {
  let content = `项目名称：${projectName}\n`
  content += `\n==================== 分镜列表 ====================\n\n`

  for (const shot of shots) {
    content += `【分镜 #${shot.shotNo}】\n`
    content += `${shot.scriptText}\n`
    if (shot.characters.length > 0) {
      content += `角色：${shot.characters.map((c) => c.characterName).join('、')}\n`
    }
    if (shot.scene) {
      content += `场景：${shot.scene.sceneName}\n`
    }
    content += `\n`
  }

  return content
}

export function downloadScriptFile(
  content: string,
  filename: string,
  env: Pick<DownloadEnvironment, 'clickDownloadLink' | 'createObjectURL' | 'revokeObjectURL'> = defaultDownloadEnvironment,
): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = env.createObjectURL(blob)
  try {
    env.clickDownloadLink(url, filename)
  } finally {
    env.revokeObjectURL(url)
  }
}
