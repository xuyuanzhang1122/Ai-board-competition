import { create } from 'zustand'

import { authApi } from '@/shared/api/auth'
import type { LoginResponse, UpdateProfileRequest, UserVO } from '@/shared/types/api'

interface UserState {
  applyLogin: (data: LoginResponse) => void
  fetchProfile: () => Promise<void>
  login: (phone: string, code: string, inviteCode?: string) => Promise<void>
  loginWithPassword: (username: string, password: string) => Promise<void>
  logout: () => void
  points: number
  setPoints: (points: number) => void
  syncSession: () => void
  token: string
  updateProfile: (data: UpdateProfileRequest) => Promise<void>
  user: UserVO | null
  userId: number | null
}
const storedSession = () => {
  const token = localStorage.getItem('token') || ''
  return { token, userId: token ? Number(localStorage.getItem('user_id')) || null : null }
}
const matches = (
  left: { token: string; userId: number | null },
  right: { token: string; userId: number | null },
) => left.token === right.token && left.userId === right.userId

export const useUserStore = create<UserState>((set, get) => {
  const current = (expected: { token: string; userId: number | null }) => {
    if (matches(expected, get()) && matches(expected, storedSession())) return true
    get().syncSession()
    return false
  }
  return {
    ...storedSession(),
    user: null,
    points: 0,

    async loginWithPassword(username, password) {
      get().syncSession()
      const expected = storedSession()
      const data = await authApi.loginWithPassword({ username, password })
      if (current(expected)) get().applyLogin(data)
    },
    async login(phone, code, inviteCode) {
      get().syncSession()
      const expected = storedSession()
      const data = await authApi.login({ phone, code, inviteCode })
      if (current(expected)) get().applyLogin(data)
    },
    applyLogin(data) {
      // Persist the identity pair before notifying synchronous store subscribers.
      localStorage.setItem('token', data.token)
      localStorage.setItem('user_id', String(data.userId))
      set({
        token: data.token,
        userId: data.userId,
        user: {
          userId: data.userId,
          nickname: data.nickname,
          avatarUrl: data.avatarUrl,
          status: 1,
          balance: data.balance,
          createdAt: '',
        },
        points: data.balance,
      })
    },
    logout() {
      localStorage.removeItem('token')
      localStorage.removeItem('user_id')
      set({ token: '', userId: null, user: null, points: 0 })
    },
    syncSession() {
      const identity = storedSession()
      if (!matches(identity, get())) set({ ...identity, user: null, points: 0 })
    },
    async fetchProfile() {
      const expected = { token: get().token, userId: get().userId }
      if (!current(expected)) return
      const user = await authApi.getProfile()
      if (!current(expected) || user.userId !== expected.userId) return
      set({ user, points: user.balance })
    },
    async updateProfile(data) {
      const expected = { token: get().token, userId: get().userId }
      if (!current(expected)) return
      const updatedUser = await authApi.updateProfile(data)
      if (!current(expected)) return
      if (updatedUser) {
        if (updatedUser.userId === expected.userId)
          set({ user: updatedUser, points: updatedUser.balance })
      } else await get().fetchProfile()
    },
    setPoints(points) {
      set({ points })
    },
  }
})

// Cross-tab credential changes invalidate the previous profile immediately.
if (typeof window !== 'undefined')
  window.addEventListener('storage', (event) => {
    if (event.key === 'token' || event.key === 'user_id' || event.key === null)
      useUserStore.getState().syncSession()
  })

/** 路由守卫/拦截器等 React 之外的场景使用 */
export const isAuthenticated = () => !!useUserStore.getState().token
