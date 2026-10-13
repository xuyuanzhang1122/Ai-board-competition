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
  token: string
  updateProfile: (data: UpdateProfileRequest) => Promise<void>
  user: UserVO | null
  userId: number | null
}

export const useUserStore = create<UserState>((set, get) => ({
  token: localStorage.getItem('token') || '',
  userId: Number(localStorage.getItem('user_id')) || null,
  user: null,
  points: 0,

  async loginWithPassword(username, password) {
    const data = await authApi.loginWithPassword({ username, password })
    get().applyLogin(data)
  },

  async login(phone, code, inviteCode) {
    const data = await authApi.login({ phone, code, inviteCode })
    get().applyLogin(data)
  },

  applyLogin(data) {
    // 后端登录返回扁平结构,转换为 UserVO
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
    localStorage.setItem('token', data.token)
    localStorage.setItem('user_id', String(data.userId))
  },

  logout() {
    set({ token: '', userId: null, user: null, points: 0 })
    localStorage.removeItem('token')
    localStorage.removeItem('user_id')
  },

  async fetchProfile() {
    const user = await authApi.getProfile()
    set({ userId: user.userId, user, points: user.balance })
    localStorage.setItem('user_id', String(user.userId))
  },

  async updateProfile(data) {
    const updatedUser = await authApi.updateProfile(data)
    if (updatedUser) {
      set({ user: updatedUser })
    } else {
      await get().fetchProfile()
    }
  },

  setPoints(points) {
    set({ points })
  },
}))

/** 路由守卫/拦截器等 React 之外的场景使用 */
export const isAuthenticated = () => !!useUserStore.getState().token
