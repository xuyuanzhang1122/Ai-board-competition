import type { ProjectVO } from '@/shared/types/api'

export interface EditorPageInitDeps {
  fetchProjectDetail: (id: number) => Promise<ProjectVO>
  initProject: (id: number) => Promise<void>
}

export interface EditorPageInitSuccess {
  ok: true
  project: ProjectVO
  projectId: number
}

export interface EditorPageInitFailure {
  error: string
  ok: false
}

export type EditorPageInitResult = EditorPageInitSuccess | EditorPageInitFailure

export async function initializeEditorPage(
  rawId: string | undefined,
  deps: EditorPageInitDeps,
): Promise<EditorPageInitResult> {
  const id = Number(rawId)
  if (!rawId || !Number.isFinite(id) || id <= 0) {
    return { ok: false, error: '项目 ID 无效，请从首页重新进入编辑器' }
  }

  try {
    const [project] = await Promise.all([deps.fetchProjectDetail(id), deps.initProject(id)])
    return { ok: true, project, projectId: id }
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载项目失败，请稍后重试'
    return { ok: false, error: message }
  }
}
