import { create } from 'zustand'

import { adminApi } from '@/shared/api/admin'
import { TOKEN_KEY } from '@/shared/api/client'
import type { AdminInfo } from '@/shared/api/types'

interface AuthState {
  admin: AdminInfo | null
  displayName: string
  fetchMe: () => Promise<void>
  isAuthed: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  token: string
}

const getStoredToken = () => {
  if (typeof localStorage === 'undefined') return ''
  return localStorage.getItem(TOKEN_KEY) || ''
}

const getDisplayName = (admin: AdminInfo | null) =>
  admin?.displayName || admin?.username || '管理员'

const initialToken = getStoredToken()
let pendingFetchMe: Promise<AdminInfo> | null = null

export const useAuthStore = create<AuthState>((set) => ({
  admin: null,
  displayName: '管理员',
  fetchMe: async () => {
    pendingFetchMe ||= adminApi.me()
    try {
      const admin = await pendingFetchMe
      set({ admin, displayName: getDisplayName(admin) })
    } finally {
      pendingFetchMe = null
    }
  },
  isAuthed: Boolean(initialToken),
  login: async (username, password) => {
    const admin = await adminApi.login(username, password)
    const token = admin.token || ''

    if (token) {
      localStorage.setItem(TOKEN_KEY, token)
    } else {
      localStorage.removeItem(TOKEN_KEY)
    }

    set({
      admin,
      displayName: getDisplayName(admin),
      isAuthed: Boolean(token),
      token,
    })
  },
  logout: () => {
    localStorage.removeItem(TOKEN_KEY)
    set({ admin: null, displayName: '管理员', isAuthed: false, token: '' })
  },
  token: initialToken,
}))
