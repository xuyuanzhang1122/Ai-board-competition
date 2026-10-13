import { api } from './client'
import type {
  AdminInfo,
  AiModel,
  CreateUserPayload,
  ModelPayload,
  PageResult,
  UserDetail,
  UserListItem,
} from './types'

export const adminApi = {
  login(username: string, password: string): Promise<AdminInfo> {
    return api.post('/admin/auth/login', { username, password })
  },
  me(): Promise<AdminInfo> {
    return api.get('/admin/auth/me')
  },

  pageUsers(page: number, size: number, keyword?: string): Promise<PageResult<UserListItem>> {
    return api.get('/admin/users', { params: { page, size, keyword: keyword || undefined } })
  },
  getUser(userId: number): Promise<UserDetail> {
    return api.get(`/admin/users/${userId}`)
  },
  createUser(payload: CreateUserPayload): Promise<UserDetail> {
    return api.post('/admin/users', payload)
  },
  updateUser(
    userId: number,
    payload: { nickname?: string; avatarUrl?: string; status?: number },
  ): Promise<UserDetail> {
    return api.put(`/admin/users/${userId}`, payload)
  },
  setPassword(userId: number, payload: { username?: string; password: string }): Promise<void> {
    return api.put(`/admin/users/${userId}/password`, payload)
  },
  adjustPoints(userId: number, delta: number, remark?: string): Promise<UserDetail> {
    return api.post(`/admin/users/${userId}/points`, { delta, remark })
  },
  deleteUser(userId: number): Promise<void> {
    return api.delete(`/admin/users/${userId}`)
  },

  listModels(type?: string): Promise<AiModel[]> {
    return api.get('/admin/models', { params: { type: type || undefined } })
  },
  createModel(payload: ModelPayload): Promise<AiModel> {
    return api.post('/admin/models', payload)
  },
  updateModel(id: number, payload: ModelPayload): Promise<AiModel> {
    return api.put(`/admin/models/${id}`, payload)
  },
  toggleModel(id: number, enabled: boolean): Promise<AiModel> {
    return api.patch(`/admin/models/${id}/enabled`, { enabled })
  },
  deleteModel(id: number): Promise<void> {
    return api.delete(`/admin/models/${id}`)
  },
}
