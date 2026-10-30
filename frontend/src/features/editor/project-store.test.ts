import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useUserStore } from '@/shared/store/user'
import type { FolderVO, ProjectVO } from '@/shared/types/api'

import { createProjectStore, type ProjectStoreApi } from './project-store'

vi.mock('@/shared/api/client', () => ({
  default: { delete: vi.fn(), get: vi.fn(), post: vi.fn(), put: vi.fn() },
}))

const project = (id: number, folderId: number | null, name = `项目 ${id}`): ProjectVO => ({
  aspectRatio: '16:9',
  createdAt: '2026-06-28T00:00:00Z',
  eraSetting: null,
  folderId,
  id,
  name,
  styleCode: 'default',
  updatedAt: '2026-06-28T00:00:00Z',
})

const folder = (id: number): FolderVO => ({
  createdAt: '2026-06-28T00:00:00Z',
  id,
  name: `文件夹 ${id}`,
})

const createApi = (): ProjectStoreApi => ({
  createFolder: vi.fn(async () => folder(9)),
  createProject: vi.fn(async () => project(9, null)),
  deleteFolder: vi.fn(async () => undefined),
  deleteProject: vi.fn(async () => undefined),
  getFolders: vi.fn(async () => [folder(1)]),
  getProject: vi.fn(async (id) => project(id, null)),
  getProjects: vi.fn(async () => ({
    current: 1,
    pages: 1,
    records: [project(1, 4), project(2, null)],
    size: 20,
    total: 2,
  })),
  moveProject: vi.fn(async (id, folderId) => project(id, folderId)),
  updateFolder: vi.fn(async (id, data) => ({ ...folder(id), ...data })),
  updateProject: vi.fn(async (id, data) => ({ ...project(id, null), ...data })),
})

describe('project Zustand store', () => {
  let api: ProjectStoreApi

  beforeEach(() => {
    api = createApi()
  })

  it('reuses the project API for pagination/filtering and derives folder groups', async () => {
    const store = createProjectStore(api)
    store.setState({ folders: [folder(4)] })
    store.getState().setSelectedFolder(4)

    await store.getState().fetchProjects(2, '短片')

    expect(api.getProjects).toHaveBeenCalledWith({
      folderId: 4,
      keyword: '短片',
      page: 2,
      size: 20,
    })
    expect(store.getState()).toMatchObject({
      currentPage: 2,
      keyword: '短片',
      loading: false,
      total: 2,
    })
    expect(store.getState().projectsByFolder['4'].map(({ id }) => id)).toEqual([1])
    expect(store.getState().projectsByFolder.uncategorized.map(({ id }) => id)).toEqual([2])
  })

  it('updates both list and currentProject without creating a second project snapshot', async () => {
    const store = createProjectStore(api)
    store.setState({ currentProject: project(1, null), projects: [project(1, null)] })

    await store.getState().updateProject(1, { name: '新名称' })

    expect(store.getState().projects[0].name).toBe('新名称')
    expect(store.getState().currentProject?.name).toBe('新名称')
  })

  it('moves projects from a deleted folder to uncategorized', async () => {
    const store = createProjectStore(api)
    store.setState({ folders: [folder(4)], projects: [project(1, 4)] })

    await store.getState().deleteFolder(4)

    expect(store.getState().folders).toEqual([])
    expect(store.getState().projects[0].folderId).toBeNull()
    expect(store.getState().projectsByFolder.uncategorized[0].id).toBe(1)
  })

  it('clears stale currentProject and rethrows detail errors', async () => {
    const failure = new Error('not found')
    api.getProject = vi.fn(async () => {
      throw failure
    })
    const store = createProjectStore(api)
    store.setState({ currentProject: project(1, null) })

    await expect(store.getState().fetchProjectDetail(2)).rejects.toBe(failure)
    expect(store.getState().currentProject).toBeNull()
  })
})

it('does not restore A project detail after a B session has loaded its authorized detail', async () => {
  const originalIdentity = useUserStore.getState()
  useUserStore.setState({ userId: 1, token: 'late-A' })
  let finishA!: (value: ProjectVO) => void
  const api = createApi()
  api.getProject = vi.fn().mockImplementationOnce(() => new Promise<ProjectVO>((resolve) => { finishA = resolve })).mockResolvedValueOnce(project(7, null, 'B授权项目'))
  const store = createProjectStore(api)
  const pendingA = store.getState().fetchProjectDetail(7)
  useUserStore.setState({ userId: 2, token: 'late-B' })
  await store.getState().fetchProjectDetail(7)
  finishA(project(7, null, 'A旧项目'))
  await expect(pendingA).rejects.toThrow('项目会话已切换')
  expect(store.getState().currentProject?.name).toBe('B授权项目')
  useUserStore.setState({ userId: originalIdentity.userId, token: originalIdentity.token })
})
