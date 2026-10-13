import { beforeEach, describe, expect, it, vi } from 'vitest'

import { adminApi } from '@/shared/api/admin'
import { TOKEN_KEY } from '@/shared/api/client'
import type { AdminInfo } from '@/shared/api/types'

import { useAuthStore } from './auth'

const storage = new Map<string, string>()
const localStorageMock: Storage = {
  get length() {
    return storage.size
  },
  clear: vi.fn(() => storage.clear()),
  getItem: vi.fn((key: string) => storage.get(key) ?? null),
  key: vi.fn((index: number) => [...storage.keys()][index] ?? null),
  removeItem: vi.fn((key: string) => storage.delete(key)),
  setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
}

const adminInfo: AdminInfo = {
  adminId: 1,
  displayName: '系统管理员',
  lastLoginAt: '2026-06-27T12:00:00',
  token: 'admin-jwt',
  username: 'admin',
}

describe('admin auth store', () => {
  beforeEach(() => {
    storage.clear()
    vi.clearAllMocks()
    vi.restoreAllMocks()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: localStorageMock,
    })
    useAuthStore.setState({
      admin: null,
      displayName: '管理员',
      isAuthed: false,
      token: '',
    })
  })

  it('login 保存 admin_token 并更新登录派生状态', async () => {
    vi.spyOn(adminApi, 'login').mockResolvedValue(adminInfo)

    await useAuthStore.getState().login('admin', 'secret')

    const state = useAuthStore.getState()
    expect(adminApi.login).toHaveBeenCalledWith('admin', 'secret')
    expect(storage.get(TOKEN_KEY)).toBe('admin-jwt')
    expect(state.token).toBe('admin-jwt')
    expect(state.admin).toEqual(adminInfo)
    expect(state.isAuthed).toBe(true)
    expect(state.displayName).toBe('系统管理员')
  })

  it('fetchMe 恢复管理员信息并保留现有 token', async () => {
    useAuthStore.setState({ isAuthed: true, token: 'persisted-token' })
    vi.spyOn(adminApi, 'me').mockResolvedValue({ ...adminInfo, token: null })

    await useAuthStore.getState().fetchMe()

    const state = useAuthStore.getState()
    expect(state.token).toBe('persisted-token')
    expect(state.admin?.adminId).toBe(1)
    expect(state.displayName).toBe('系统管理员')
  })

  it('logout 仅清除 admin_token 并重置认证状态', () => {
    storage.set(TOKEN_KEY, 'admin-jwt')
    storage.set('token', 'user-jwt')
    useAuthStore.setState({
      admin: adminInfo,
      displayName: adminInfo.displayName,
      isAuthed: true,
      token: 'admin-jwt',
    })

    useAuthStore.getState().logout()

    const state = useAuthStore.getState()
    expect(storage.has(TOKEN_KEY)).toBe(false)
    expect(storage.get('token')).toBe('user-jwt')
    expect(state).toMatchObject({
      admin: null,
      displayName: '管理员',
      isAuthed: false,
      token: '',
    })
  })
})
