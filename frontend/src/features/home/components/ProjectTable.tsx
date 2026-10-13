import { ActionIcon, Button, Empty, Segmented, Skeleton } from '@lobehub/ui'
import { FileText, Folder, Trash2, X } from 'lucide-react'
import { useMemo } from 'react'

import { Card } from '@/components/ui/card'
import type { FolderVO, ProjectVO } from '@/shared/types/api'

import { type HomeTab, useHomeUiStore } from '../store'

interface ProjectTableProps {
  folders: FolderVO[]
  loading: boolean
  onDeleteFolder: (folder: FolderVO) => void
  onDeleteProject: (project: ProjectVO) => void
  onEditFolder: (folder: FolderVO) => void
  onEditProject: (project: ProjectVO) => void
  onMoveProject: (project: ProjectVO) => void
  projects: ProjectVO[]
  scrollEnabled?: boolean
}

function formatDate(date: string) {
  const value = new Date(date)
  if (Number.isNaN(value.getTime())) return '—'

  return value.toLocaleDateString('zh-CN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function ProjectTable({
  folders,
  loading,
  onDeleteFolder,
  onDeleteProject,
  onEditFolder,
  onEditProject,
  onMoveProject,
  projects,
  scrollEnabled = true,
}: ProjectTableProps) {
  const activeTab = useHomeUiStore((state) => state.activeTab)
  const selectedFolderId = useHomeUiStore((state) => state.selectedFolderId)
  const selectedFolderName = useHomeUiStore((state) => state.selectedFolderName)
  const clearFolderFilter = useHomeUiStore((state) => state.clearFolderFilter)
  const selectFolder = useHomeUiStore((state) => state.selectFolder)
  const setActiveTab = useHomeUiStore((state) => state.setActiveTab)

  const visibleProjects = useMemo(
    () =>
      selectedFolderId === null
        ? projects
        : projects.filter((project) => project.folderId === selectedFolderId),
    [projects, selectedFolderId],
  )
  const currentLength = activeTab === 'projects' ? visibleProjects.length : folders.length

  return (
    <Card className="h-full gap-0 py-0 shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2">
        <Segmented
          value={activeTab}
          variant="filled"
          options={[
            { label: `项目 (${projects.length})`, value: 'projects' },
            { label: `文件夹 (${folders.length})`, value: 'folders' },
          ]}
          onChange={(value) => {
            const tab = value as HomeTab
            setActiveTab(tab)
            if (tab === 'projects') clearFolderFilter()
          }}
        />

        {selectedFolderId !== null ? (
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <span>当前文件夹：</span>
            <span className="font-medium text-foreground">{selectedFolderName}</span>
            <ActionIcon
              icon={X}
              size="small"
              title="清除文件夹筛选"
              variant="borderless"
              onClick={clearFolderFilter}
            />
          </div>
        ) : null}
      </div>

      <div className={`min-h-0 flex-1 ${scrollEnabled ? 'overflow-auto' : 'overflow-hidden'}`}>
        <div className="min-w-[640px]">
          <div className="grid grid-cols-12 gap-4 border-b border-border bg-muted/60 px-4 py-2 text-xs font-medium text-muted-foreground">
            <div className="col-span-6">名称</div>
            <div className="col-span-3">更新时间</div>
            <div className="col-span-3 text-right">操作</div>
          </div>

          {loading ? (
            <div className="px-4 py-5">
              <Skeleton active paragraph={{ rows: 3 }} title={false} />
            </div>
          ) : currentLength === 0 ? (
            <Empty
              className="py-10"
              description={`暂无${activeTab === 'projects' ? '项目' : '文件夹'}`}
              icon={activeTab === 'projects' ? FileText : Folder}
              title="这里还是空的"
            />
          ) : activeTab === 'projects' ? (
            <div className="divide-y divide-border">
              {visibleProjects.map((project) => (
                <div
                  className="grid cursor-default grid-cols-12 gap-4 px-4 py-3 transition-colors hover:bg-rose-50/50"
                  key={project.id}
                  title="双击进入编辑"
                  onDoubleClick={() => onEditProject(project)}
                >
                  <div className="col-span-6 flex min-w-0 items-center gap-2">
                    <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground">
                      {project.coverUrl ? (
                        <img
                          alt={project.title || project.name}
                          className="size-full object-cover"
                          src={project.coverUrl}
                        />
                      ) : (
                        <FileText aria-hidden className="size-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {project.title || project.name}
                      </p>
                      {project.description ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {project.description}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="col-span-3 flex items-center text-sm text-muted-foreground">
                    {formatDate(project.updatedAt)}
                  </div>
                  <div className="col-span-3 flex items-center justify-end gap-1.5">
                    <Button size="small" onClick={() => onEditProject(project)}>
                      编辑
                    </Button>
                    <Button size="small" onClick={() => onMoveProject(project)}>
                      移动
                    </Button>
                    <ActionIcon
                      danger
                      icon={Trash2}
                      size="small"
                      title={`删除项目 ${project.title || project.name}`}
                      variant="borderless"
                      onClick={() => onDeleteProject(project)}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {folders.map((folder) => (
                <div
                  className="grid grid-cols-12 gap-4 px-4 py-2 transition-colors hover:bg-muted/50"
                  key={folder.id}
                >
                  <button
                    className="col-span-6 flex min-w-0 items-center gap-2 text-left"
                    type="button"
                    onClick={() => selectFolder(folder.id, folder.name)}
                  >
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Folder aria-hidden className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{folder.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {projects.filter((project) => project.folderId === folder.id).length} 个项目
                      </p>
                    </div>
                  </button>
                  <div className="col-span-3 flex items-center text-sm text-muted-foreground">
                    {formatDate(folder.createdAt)}
                  </div>
                  <div className="col-span-3 flex items-center justify-end gap-1.5">
                    <Button size="small" onClick={() => onEditFolder(folder)}>
                      编辑
                    </Button>
                    <ActionIcon
                      danger
                      icon={Trash2}
                      size="small"
                      title={`删除文件夹 ${folder.name}`}
                      variant="borderless"
                      onClick={() => onDeleteFolder(folder)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
        共 {currentLength} 个{activeTab === 'projects' ? '项目' : '文件夹'}
        {activeTab === 'projects' ? ' · 双击任意项目可直接进入编辑' : ''}
      </div>
    </Card>
  )
}
