import api from '@/shared/api/client'
import type {
  CreateFolderDTO,
  CreateProjectDTO,
  FolderVO,
  PageResult,
  ProjectVO,
  UpdateFolderDTO,
  WalletVO,
} from '@/shared/types/api'

export interface ProjectListParams {
  folderId?: number | null
  keyword?: string
  page: number
  size: number
}

export const homeApi = {
  createFolder(data: CreateFolderDTO): Promise<FolderVO> {
    return api.post('/folders', data)
  },

  createProject(data: CreateProjectDTO): Promise<ProjectVO> {
    return api.post('/projects', data)
  },

  deleteFolder(id: number): Promise<void> {
    return api.delete(`/folders/${id}`)
  },

  deleteProject(id: number): Promise<void> {
    return api.delete(`/projects/${id}`)
  },

  getFolders(): Promise<FolderVO[]> {
    return api.get('/folders')
  },

  getProject(id: number): Promise<ProjectVO> {
    return api.get(`/projects/${id}`)
  },

  getProjects(params: ProjectListParams): Promise<PageResult<ProjectVO>> {
    return api.get('/projects', { params })
  },

  getWallet(): Promise<WalletVO> {
    return api.get('/wallet')
  },

  moveProject(id: number, folderId: number | null): Promise<ProjectVO> {
    const data = { folderId }
    return api.put(`/projects/${id}`, data)
  },

  updateProject(id: number, data: Partial<ProjectVO>): Promise<ProjectVO> {
    return api.put(`/projects/${id}`, data)
  },

  updateFolder(id: number, data: UpdateFolderDTO): Promise<FolderVO> {
    return api.put(`/folders/${id}`, data)
  },
}

export const homeQueryKeys = {
  all: ['home'] as const,
  folders: ['home', 'folders'] as const,
  projects: ['home', 'projects'] as const,
  projectList: (keyword: string) => ['home', 'projects', { keyword }] as const,
  wallet: ['home', 'wallet'] as const,
}
