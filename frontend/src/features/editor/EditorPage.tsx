import './editor.css'

import { Button } from '@lobehub/ui'
import { FileDown, FileText, Home, Images, Settings } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { notify } from '@/shared/feedback/feedback'
import { useUserStore } from '@/shared/store/user'
import type { ExportRequest } from '@/shared/types/api'

import { AssetVersionModal } from './components/dialogs/AssetVersionModal'
import { ModelConfigModal } from './components/dialogs/ModelConfigModal'
import {
  buildScriptContent,
  collectReadyAssets,
  downloadAssetsSequentially,
  downloadScriptFile,
  submitExportTask,
} from './components/export/export-state'
import { ExportModal } from './components/export/ExportModal'
import { ExportProgressModal } from './components/export/ExportProgressModal'
import { ProjectNameEditor } from './components/ProjectNameEditor'
import { RightPanelManager } from './components/RightPanelManager'
import type {
  AssetVersionDialogRequest,
} from './components/storyboard/StoryboardRow'
import { StoryboardTable } from './components/storyboard/StoryboardTable'
import { useEditorKeyboardShortcuts } from './editor-page-keyboard'
import { initializeEditorPage } from './editor-page-logic'
import { usePanelManagerStore } from './panel-manager-store'
import { useProjectStore } from './project-store'
import { useEditorStore } from './store'

export function EditorPage() {
  const { id } = useParams<{ id: string }>()
  const userId = useUserStore((state) => state.userId)
  const token = useUserStore((state) => state.token)

  const initProject = useEditorStore((state) => state.initProject)
  const resetEditor = useEditorStore((state) => state.reset)
  const projectId = useEditorStore((state) => state.projectId)
  const shots = useEditorStore((state) => state.shots)
  const selectedShotIds = useEditorStore((state) => state.selectedShotIds)
  const canUndo = useEditorStore((state) => state.canUndo)
  const canRedo = useEditorStore((state) => state.canRedo)
  const undo = useEditorStore((state) => state.undo)
  const redo = useEditorStore((state) => state.redo)
  const selectAll = useEditorStore((state) => state.selectAll)
  const deselectAll = useEditorStore((state) => state.deselectAll)
  const deleteShot = useEditorStore((state) => state.deleteShot)

  const currentProject = useProjectStore((state) => state.currentProject)
  const fetchProjectDetail = useProjectStore((state) => state.fetchProjectDetail)
  const updateProject = useProjectStore((state) => state.updateProject)

  const closePanel = usePanelManagerStore((state) => state.closePanel)

  const [pageStatus, setPageStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [versionRequest, setVersionRequest] = useState<AssetVersionDialogRequest | null>(null)
  const [modelConfigOpen, setModelConfigOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportJobId, setExportJobId] = useState<number | null>(null)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)

  const assetDialogs = useMemo(
    () => ({
      openVersions: setVersionRequest,
    }),
    [],
  )

  // Clear owned data synchronously, before a new account can render asset actions.
  useEffect(() => useUserStore.subscribe((state, previous) => {
    if (state.userId === previous.userId && state.token === previous.token) return
    resetEditor()
    useProjectStore.getState().setCurrentProject(null)
    setPageStatus('loading')
    setVersionRequest(null)
    setExportOpen(false)
    setExportJobId(null)
    setModelConfigOpen(false)
  }), [resetEditor])

  useEffect(() => {
    /* eslint-disable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect --
       初始化流程需要在 effect 内根据异步结果切换页面状态;直接 setState 是这里的最小副作用。 */
    setPageStatus('loading')
    setErrorMessage(null)
    let cancelled = false

    initializeEditorPage(id, { fetchProjectDetail, initProject }).then((result) => {
      if (cancelled) return
      if (result.ok) {
        setPageStatus('ready')
      } else {
        setErrorMessage(result.error)
        setPageStatus('error')
      }
    })
    /* eslint-enable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect */

    return () => {
      cancelled = true
      resetEditor()
      closePanel()
    }
  }, [id, userId, token, fetchProjectDetail, initProject, resetEditor, closePanel])

  useEditorKeyboardShortcuts({
    canRedo,
    canUndo,
    deleteShot,
    deselectAll,
    onRedo: redo,
    onSelectAll: selectAll,
    onUndo: undo,
    selectedShotIds,
    shots,
  })

  useEffect(() => {
    if (!exportMenuOpen) return
    const handleClick = (event: MouseEvent) => {
      if (!exportMenuRef.current?.contains(event.target as Node)) {
        setExportMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [exportMenuOpen])

  const handleUpdateProjectName = async (name: string) => {
    if (!currentProject) return
    await updateProject(currentProject.id, { name })
  }

  const handleExportConfirm = async (request: ExportRequest) => {
    if (!projectId) return
    setExportOpen(false)
    try {
      const jobId = await submitExportTask(projectId, request)
      setExportJobId(jobId)
    } catch (error) {
      const message = error instanceof Error ? error.message : '提交导出任务失败'
      notify.error(message)
    }
  }

  const handleExportAssets = async () => {
    setExportMenuOpen(false)
    const assets = collectReadyAssets(shots, {
      shotIds: selectedShotIds.size > 0 ? selectedShotIds : undefined,
    })
    if (assets.length === 0) {
      notify.warning('当前项目/选择中没有已生成的图片或视频')
      return
    }
    notify.info(`开始下载 ${assets.length} 个文件...`)
    const { success, fail } = await downloadAssetsSequentially(assets, undefined, { delayMs: 300 })
    if (fail > 0) {
      notify.warning(`下载完成：成功 ${success} 个，失败 ${fail} 个`)
    } else {
      notify.success(`成功下载 ${success} 个文件`)
    }
  }

  const handleExportScripts = () => {
    setExportMenuOpen(false)
    if (shots.length === 0) {
      notify.warning('当前项目没有分镜')
      return
    }
    const content = buildScriptContent(shots, currentProject?.name || '未命名项目')
    const filename = `${currentProject?.name || '未命名项目'}_分镜文本_${new Date().toISOString().slice(0, 10)}.txt`
    downloadScriptFile(content, filename)
    notify.success('分镜文本导出成功')
  }

  if (pageStatus === 'loading') {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_top,#eff6ff,white_48%)] text-sm text-slate-500">
        <span className="size-7 animate-spin rounded-full border-2 border-sky-100 border-t-sky-500" />
        <span>正在加载项目、分镜与资产…</span>
      </div>
    )
  }

  if (pageStatus === 'error') {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-white text-slate-700">
        <p className="text-base">{errorMessage ?? '项目加载失败'}</p>
        <Link to="/home">
          <Button icon={Home}>返回首页</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="editor-workspace flex h-screen w-full flex-col overflow-hidden">
      <header className="relative z-20 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            className="shrink-0 rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100"
            title="返回首页"
            to="/home"
          >
            <Home className="size-5" />
          </Link>
          <ProjectNameEditor project={currentProject} onSave={handleUpdateProjectName} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="h-8"
            icon={Settings}
            size="small"
            onClick={() => setModelConfigOpen(true)}
          >
            模型配置
          </Button>
          <div className="relative flex items-center gap-0" ref={exportMenuRef}>
            <Button
              className="h-8 rounded-r-none"
              icon={FileDown}
              size="small"
              type="primary"
              onClick={() => setExportOpen(true)}
            >
              导出项目
            </Button>
            <Button
              className="h-8 rounded-l-none border-l-0"
              size="small"
              onClick={() => setExportMenuOpen((prev) => !prev)}
            >
              ⋮
            </Button>
            {exportMenuOpen ? (
              <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50"
                  onClick={handleExportAssets}
                >
                  <Images className="size-4" />
                  导出图片视频
                </button>
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50"
                  onClick={handleExportScripts}
                >
                  <FileText className="size-4" />
                  导出分镜文本
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="editor-board min-w-0 flex-1">
          <StoryboardTable assetDialogs={assetDialogs} />
        </main>
        <aside aria-label="右侧创作面板" className="editor-side-panel min-w-0 overflow-auto border-l">
          <RightPanelManager />
        </aside>
      </div>

      {versionRequest ? (
        <AssetVersionModal request={versionRequest} onClose={() => setVersionRequest(null)} />
      ) : null}
      {modelConfigOpen ? (
        <ModelConfigModal open onClose={() => setModelConfigOpen(false)} />
      ) : null}
      {exportOpen ? (
        <ExportModal
          open
          selectedShotIds={selectedShotIds}
          onClose={() => setExportOpen(false)}
          onConfirm={handleExportConfirm}
        />
      ) : null}
      {exportJobId !== null ? (
        <ExportProgressModal
          jobId={exportJobId}
          key={exportJobId}
          onClose={() => setExportJobId(null)}
        />
      ) : null}
    </div>
  )
}
