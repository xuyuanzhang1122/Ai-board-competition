import { create, type StoreApi, type UseBoundStore } from 'zustand'

import { homeApi } from '@/features/home/api'
import type {
  CreateFolderDTO,
  CreateProjectDTO,
  FolderVO,
  PageResult,
  ProjectVO,
  UpdateFolderDTO,
} from '@/shared/types/api'

export interface ProjectStoreApi {
  createFolder: (data: CreateFolderDTO) => Promise<FolderVO>
  createProject: (data: CreateProjectDTO) => Promise<ProjectVO>
  deleteFolder: (id: number) => Promise<void>
  deleteProject: (id: number) => Promise<void>
  getFolders: () => Promise<FolderVO[]>
  getProject: (id: number) => Promise<ProjectVO>
  getProjects: (params: {
    folderId?: number | null
    keyword?: string
    page: number
    size: number
  }) => Promise<PageResult<ProjectVO>>
  moveProject: (id: number, folderId: number | null) => Promise<ProjectVO>
  updateFolder: (id: number, data: Partial<FolderVO>) => Promise<FolderVO>
  updateProject: (id: number, data: Partial<ProjectVO>) => Promise<ProjectVO>
}

interface ProjectData {
  currentPage: number
  currentProject: ProjectVO | null
  folders: FolderVO[]
  keyword: string
  loading: boolean
  pageSize: number
  projects: ProjectVO[]
  projectsByFolder: Record<string, ProjectVO[]>
  selectedFolderId: number | null
  total: number
}

interface ProjectActions {
  createFolder: (data: CreateFolderDTO) => Promise<FolderVO>
  createProject: (data: CreateProjectDTO) => Promise<ProjectVO>
  deleteFolder: (id: number) => Promise<void>
  deleteProject: (id: number) => Promise<void>
  fetchFolders: () => Promise<void>
  fetchProjectDetail: (id: number) => Promise<ProjectVO>
  fetchProjects: (page?: number, keyword?: string) => Promise<void>
  getFolderById: (id: number) => FolderVO | undefined
  moveProjectToFolder: (projectId: number, folderId: number | null) => Promise<void>
  setCurrentProject: (project: ProjectVO | null) => void
  setSelectedFolder: (folderId: number | null) => void
  updateFolder: (id: number, data: Partial<FolderVO>) => Promise<FolderVO>
  updateProject: (id: number, data: Partial<ProjectVO>) => Promise<ProjectVO>
}

export type ProjectStore = ProjectData & ProjectActions
export type ProjectStoreHook = UseBoundStore<StoreApi<ProjectStore>>

const defaultApi: ProjectStoreApi = {
  ...homeApi,
  updateFolder: (id, data) => homeApi.updateFolder(id, data as UpdateFolderDTO),
}

const groupProjects = (projects: ProjectVO[], folders: FolderVO[]) => {
  const grouped: Record<string, ProjectVO[]> = { uncategorized: [] }
  for (const folder of folders) grouped[String(folder.id)] = []
  for (const project of projects) {
    if (project.folderId) {
      const key = String(project.folderId)
      grouped[key] ??= []
      grouped[key].push(project)
    } else grouped.uncategorized.push(project)
  }
  return grouped
}

const initialData: ProjectData = {
  currentPage: 1,
  currentProject: null,
  folders: [],
  keyword: '',
  loading: false,
  pageSize: 20,
  projects: [],
  projectsByFolder: { uncategorized: [] },
  selectedFolderId: null,
  total: 0,
}

export const createProjectStore = (
  dependencyOverrides: Partial<ProjectStoreApi> = {},
): ProjectStoreHook => {
  const projectApi = { ...defaultApi, ...dependencyOverrides }

  return create<ProjectStore>((set, get) => {
    const update = (patch: Partial<ProjectData>) => {
      set((state) => {
        const next = { ...state, ...patch }
        return {
          ...patch,
          projectsByFolder: groupProjects(next.projects, next.folders),
        }
      })
    }

    return {
      ...initialData,

      async createFolder(data) {
        return projectApi.createFolder(data)
      },

      async createProject(data) {
        return projectApi.createProject(data)
      },

      async deleteFolder(id) {
        await projectApi.deleteFolder(id)
        update({
          folders: get().folders.filter((folder) => folder.id !== id),
          projects: get().projects.map((project) =>
            project.folderId === id ? { ...project, folderId: null } : project,
          ),
        })
      },

      async deleteProject(id) {
        await projectApi.deleteProject(id)
        const state = get()
        update({
          currentProject: state.currentProject?.id === id ? null : state.currentProject,
          projects: state.projects.filter((project) => project.id !== id),
          total: state.total - 1,
        })
      },

      async fetchFolders() {
        try {
          update({ folders: (await projectApi.getFolders()) || [] })
        } catch {
          update({ folders: [] })
        }
      },

      async fetchProjectDetail(id) {
        try {
          const project = await projectApi.getProject(id)
          update({ currentProject: project })
          return project
        } catch (error) {
          update({ currentProject: null })
          throw error
        }
      },

      async fetchProjects(page = 1, keyword = '') {
        update({ loading: true })
        try {
          const state = get()
          const result = await projectApi.getProjects({
            folderId: state.selectedFolderId,
            keyword,
            page,
            size: state.pageSize,
          })
          update({
            currentPage: page,
            keyword,
            projects: result.records || [],
            total: result.total || 0,
          })
        } catch {
          update({ projects: [], total: 0 })
        } finally {
          update({ loading: false })
        }
      },

      getFolderById(id) {
        return get().folders.find((folder) => folder.id === id)
      },

      async moveProjectToFolder(projectId, folderId) {
        await projectApi.moveProject(projectId, folderId)
        update({
          projects: get().projects.map((project) =>
            project.id === projectId ? { ...project, folderId } : project,
          ),
        })
      },

      setCurrentProject(project) {
        update({ currentProject: project })
      },

      setSelectedFolder(folderId) {
        update({ selectedFolderId: folderId })
      },

      async updateFolder(id, data) {
        const updated = await projectApi.updateFolder(id, data)
        update({
          folders: get().folders.map((folder) => (folder.id === id ? updated : folder)),
        })
        return updated
      },

      async updateProject(id, data) {
        const updated = await projectApi.updateProject(id, data)
        const state = get()
        update({
          currentProject: state.currentProject?.id === id ? updated : state.currentProject,
          projects: state.projects.map((project) => (project.id === id ? updated : project)),
        })
        return updated
      },
    }
  })
}

export const useProjectStore = createProjectStore()
