import './home.css'

import { ActionIcon, Button, Input } from '@lobehub/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowUpRight, FolderPlus, PenLine, Plus, Search, Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { BRANDING } from '@/shared/constants/config'
import { confirmAction, notify } from '@/shared/feedback/feedback'
import { useUserStore } from '@/shared/store/user'
import type { FolderVO, ProjectVO } from '@/shared/types/api'

import { homeApi, homeQueryKeys } from './api'
import { CreateProjectModal } from './components/CreateProjectModal'
import { FolderModal } from './components/FolderModal'
import { MoveProjectModal } from './components/MoveProjectModal'
import { ProjectTable } from './components/ProjectTable'
import { useHomeUiStore } from './store'

const EMPTY_FOLDERS: FolderVO[] = []
const EMPTY_PROJECTS: ProjectVO[] = []

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function HomePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fetchProfile = useUserStore((state) => state.fetchProfile)
  const selectedFolderId = useHomeUiStore((state) => state.selectedFolderId)
  const selectedFolderName = useHomeUiStore((state) => state.selectedFolderName)
  const clearFolderFilter = useHomeUiStore((state) => state.clearFolderFilter)
  const resetHomeUi = useHomeUiStore((state) => state.reset)

  const [searchKeyword, setSearchKeyword] = useState('')
  const [appliedKeyword, setAppliedKeyword] = useState('')
  const [showSearchInput, setShowSearchInput] = useState(false)
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false)
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false)
  const [editingFolder, setEditingFolder] = useState<FolderVO | null>(null)
  const [movingProject, setMovingProject] = useState<ProjectVO | null>(null)
  const projectsQuery = useQuery({
    queryFn: () =>
      homeApi.getProjects({
        keyword: appliedKeyword || undefined,
        page: 1,
        size: 20,
      }),
    queryKey: homeQueryKeys.projectList(appliedKeyword),
  })
  const foldersQuery = useQuery({
    queryFn: homeApi.getFolders,
    queryKey: homeQueryKeys.folders,
  })

  const projects = projectsQuery.data?.records ?? EMPTY_PROJECTS
  const folders = foldersQuery.data ?? EMPTY_FOLDERS

  useEffect(() => {
    void fetchProfile().catch((error: unknown) => {
      console.error('[HomePage] Failed to fetch user profile:', error)
    })
  }, [fetchProfile])

  useEffect(() => resetHomeUi, [resetHomeUi])

  const createProjectMutation = useMutation({ mutationFn: homeApi.createProject })
  const createFolderMutation = useMutation({ mutationFn: homeApi.createFolder })
  const updateFolderMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => homeApi.updateFolder(id, { name }),
  })
  const deleteFolderMutation = useMutation({ mutationFn: homeApi.deleteFolder })
  const deleteProjectMutation = useMutation({ mutationFn: homeApi.deleteProject })
  const moveProjectMutation = useMutation({
    mutationFn: ({ folderId, projectId }: { folderId: number | null; projectId: number }) =>
      homeApi.moveProject(projectId, folderId),
  })

  const handleCloseSearch = () => {
    setSearchKeyword('')
    setAppliedKeyword('')
    setShowSearchInput(false)
  }

  const handleCreateProject = async (data: Parameters<typeof homeApi.createProject>[0]) => {
    try {
      const project = await createProjectMutation.mutateAsync(data)
      if (!project?.id) throw new Error('项目创建失败：返回数据无效')

      setShowCreateProjectModal(false)
      await queryClient.invalidateQueries({ queryKey: homeQueryKeys.projects })
      notify.success('项目创建成功')
      navigate(`/editor/${project.id}`)
    } catch (error) {
      notify.error(getErrorMessage(error, '创建项目失败'))
    }
  }

  const handleCreateFolder = async (name: string) => {
    try {
      await createFolderMutation.mutateAsync({ name })
      setShowCreateFolderModal(false)
      await queryClient.invalidateQueries({ queryKey: homeQueryKeys.folders })
      notify.success('文件夹创建成功')
    } catch (error) {
      notify.error(getErrorMessage(error, '创建文件夹失败'))
    }
  }

  const handleUpdateFolder = async (name: string) => {
    if (!editingFolder) return

    try {
      await updateFolderMutation.mutateAsync({ id: editingFolder.id, name })
      setEditingFolder(null)
      await queryClient.invalidateQueries({ queryKey: homeQueryKeys.folders })
      notify.success('文件夹已更新')
    } catch (error) {
      notify.error(getErrorMessage(error, '更新文件夹失败'))
    }
  }

  const handleDeleteFolder = async (folder: FolderVO) => {
    const confirmed = await confirmAction(
      `确定要删除文件夹“${folder.name}”吗？\n文件夹内的项目将移至未分类。`,
      { confirmLabel: '删除文件夹', danger: true, title: '删除文件夹' },
    )
    if (!confirmed) return

    try {
      await deleteFolderMutation.mutateAsync(folder.id)
      if (selectedFolderId === folder.id) clearFolderFilter()
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: homeQueryKeys.folders }),
        queryClient.invalidateQueries({ queryKey: homeQueryKeys.projects }),
      ])
      notify.success('文件夹已删除')
    } catch (error) {
      notify.error(getErrorMessage(error, '删除文件夹失败'))
    }
  }

  const handleDeleteProject = async (project: ProjectVO) => {
    const title = project.title || project.name
    if (
      !(await confirmAction(`确定要删除项目“${title}”吗？\n此操作不可撤销。`, {
        confirmLabel: '删除项目',
        danger: true,
        title: '删除项目',
      }))
    ) return

    try {
      await deleteProjectMutation.mutateAsync(project.id)
      await queryClient.invalidateQueries({ queryKey: homeQueryKeys.projects })
      notify.success('项目已删除')
    } catch (error) {
      notify.error(getErrorMessage(error, '删除项目失败'))
    }
  }

  const handleMoveProject = async (folderId: number | null) => {
    if (!movingProject) return

    try {
      await moveProjectMutation.mutateAsync({ folderId, projectId: movingProject.id })
      setMovingProject(null)
      await queryClient.invalidateQueries({ queryKey: homeQueryKeys.projects })
      notify.success('项目已移动')
    } catch (error) {
      notify.error(getErrorMessage(error, '移动项目失败'))
    }
  }

  const visibleProjectCount =
    selectedFolderId === null
      ? (projectsQuery.data?.total ?? projects.length)
      : projects.filter((project) => project.folderId === selectedFolderId).length
  const mutating =
    createProjectMutation.isPending ||
    createFolderMutation.isPending ||
    updateFolderMutation.isPending ||
    moveProjectMutation.isPending

  return (
    <div className="home-page h-full overflow-y-auto">
      <div className="home-scroll-content">
        <section aria-labelledby="home-title" className="home-hero-panel">
          <div className="home-hero-content">
            <p className="home-hero-kicker">{BRANDING.competition}</p>
            <h1 id="home-title">AI 创作工作台</h1>
            <p className="home-hero-team">{BRANDING.teamName}</p>
            <p className="home-competition-disclaimer">{BRANDING.disclaimer}</p>
          </div>
        </section>

        <div className="home-entry-grid">
          <button className="home-entry" type="button" onClick={() => navigate('/brainstorm')}>
            <span className="home-entry-icon"><Sparkles aria-hidden size={21} /></span>
            <span><strong>头脑风暴</strong><small>资料与大纲创作</small></span>
            <ArrowUpRight aria-hidden className="home-entry-arrow" size={18} />
          </button>
          <button className="home-entry" type="button" onClick={() => navigate('/creation')}>
            <span className="home-entry-icon"><PenLine aria-hidden size={21} /></span>
            <span><strong>落笔生辉</strong><small>从简报生成剧本与分镜</small></span>
            <ArrowUpRight aria-hidden className="home-entry-arrow" size={18} />
          </button>
        </div>

        <section className="home-project-surface">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              {selectedFolderId !== null ? (
                <Button icon={ArrowLeft} type="text" onClick={clearFolderFilter}>
                  返回
                </Button>
              ) : null}
              <div className="min-w-0">
                <h2 className="truncate text-xl font-semibold text-foreground">
                  {selectedFolderId !== null ? `${selectedFolderName} 中的项目` : '所有项目'}
                </h2>
                <p className="text-xs text-muted-foreground">
                  共 {visibleProjectCount} 个项目 · {folders.length} 个文件夹
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button className="home-project-create" icon={Plus} type="primary" onClick={() => setShowCreateProjectModal(true)}>
                新建项目
              </Button>
              <Button icon={FolderPlus} onClick={() => setShowCreateFolderModal(true)}>
                新建文件夹
              </Button>
              {showSearchInput ? (
                <div className="flex min-w-0 max-w-full items-center gap-1">
                  <Input
                    allowClear
                    autoFocus
                    placeholder="搜索项目..."
                    prefix={<Search aria-hidden className="size-4 text-muted-foreground" />}
                    value={searchKeyword}
                    onChange={(event) => setSearchKeyword(event.target.value)}
                    onPressEnter={() => setAppliedKeyword(searchKeyword.trim())}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') handleCloseSearch()
                    }}
                  />
                  <ActionIcon
                    icon={X}
                    title="关闭搜索"
                    variant="borderless"
                    onClick={handleCloseSearch}
                  />
                </div>
              ) : (
                <Button icon={Search} onClick={() => setShowSearchInput(true)}>
                  搜索
                </Button>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1">
            <ProjectTable
              folders={folders}
              loading={projectsQuery.isPending || foldersQuery.isPending}
              projects={projects}
              onDeleteFolder={handleDeleteFolder}
              onDeleteProject={handleDeleteProject}
              onEditFolder={setEditingFolder}
              onEditProject={(project) => navigate(`/editor/${project.id}`)}
              onMoveProject={setMovingProject}
            />
          </div>
        </section>
      </div>

      {showCreateProjectModal ? (
        <CreateProjectModal
          folderId={selectedFolderId}
          loading={createProjectMutation.isPending}
          onCancel={() => setShowCreateProjectModal(false)}
          onConfirm={handleCreateProject}
        />
      ) : null}
      {showCreateFolderModal ? (
        <FolderModal
          loading={createFolderMutation.isPending}
          title="新建文件夹"
          onCancel={() => setShowCreateFolderModal(false)}
          onConfirm={handleCreateFolder}
        />
      ) : null}
      {editingFolder ? (
        <FolderModal
          initialName={editingFolder.name}
          loading={updateFolderMutation.isPending}
          title="编辑文件夹"
          onCancel={() => setEditingFolder(null)}
          onConfirm={handleUpdateFolder}
        />
      ) : null}
      {movingProject ? (
        <MoveProjectModal
          folders={folders}
          loading={moveProjectMutation.isPending}
          project={movingProject}
          onCancel={() => setMovingProject(null)}
          onConfirm={handleMoveProject}
        />
      ) : null}

      {mutating ? (
        <span aria-live="polite" className="sr-only">
          正在处理
        </span>
      ) : null}
    </div>
  )
}
