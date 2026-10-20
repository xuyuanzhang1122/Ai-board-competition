import { beforeEach, describe, expect, it, vi } from 'vitest'

import { authApi } from '@/shared/api/auth'
import type { LoginResponse, UserVO } from '@/shared/types/api'

import { useUserStore } from './user'

const browser = vi.hoisted(() => {
  const values = new Map<string, string>()
  const events = new EventTarget()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value)
      },
      removeItem: (key: string) => {
        values.delete(key)
      },
    },
  })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: events })
  return { values, events }
})
vi.mock('@/shared/api/auth', () => ({
  authApi: {
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    login: vi.fn(),
    loginWithPassword: vi.fn(),
  },
}))
const accountA: LoginResponse = {
  userId: 1,
  token: 'token-A',
  nickname: 'A',
  avatarUrl: null,
  balance: 5,
}
const accountB: LoginResponse = {
  userId: 2,
  token: 'token-B',
  nickname: 'B',
  avatarUrl: null,
  balance: 20,
}
const profileA: UserVO = {
  userId: 1,
  nickname: 'A late profile',
  avatarUrl: null,
  balance: 99,
  status: 1,
  createdAt: '',
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const changeStorageToB = () => {
  browser.values.set('token', 'token-B')
  browser.values.set('user_id', '2')
}

beforeEach(() => {
  browser.values.clear()
  vi.clearAllMocks()
  useUserStore.getState().applyLogin(accountA)
})

describe('cross-tab user session', () => {
  it('synchronizes storage identity and clears the previous profile and balance', () => {
    changeStorageToB()
    const event = new Event('storage')
    Object.defineProperty(event, 'key', { value: 'token' })
    browser.events.dispatchEvent(event)
    expect(useUserStore.getState()).toMatchObject({
      token: 'token-B',
      userId: 2,
      user: null,
      points: 0,
    })
  })
  it('drops a slow profile result after another account logs in', async () => {
    const response = deferred<UserVO>()
    vi.mocked(authApi.getProfile).mockReturnValueOnce(response.promise)
    const request = useUserStore.getState().fetchProfile()
    useUserStore.getState().applyLogin(accountB)
    response.resolve(profileA)
    await request
    expect(useUserStore.getState()).toMatchObject({
      token: 'token-B',
      userId: 2,
      user: { nickname: 'B' },
      points: 20,
    })
    expect(localStorage.getItem('user_id')).toBe('2')
  })
  it('drops a slow profile update even before a cross-tab storage event is delivered', async () => {
    const response = deferred<UserVO>()
    vi.mocked(authApi.updateProfile).mockReturnValueOnce(response.promise)
    const request = useUserStore.getState().updateProfile({ nickname: 'A edit' })
    changeStorageToB()
    response.resolve(profileA)
    await request
    expect(useUserStore.getState()).toMatchObject({
      token: 'token-B',
      userId: 2,
      user: null,
      points: 0,
    })
  })
  it('never starts a profile write using an obsolete in-memory account', async () => {
    changeStorageToB()
    await useUserStore.getState().updateProfile({ nickname: 'A private nickname' })
    expect(authApi.updateProfile).not.toHaveBeenCalled()
    expect(useUserStore.getState()).toMatchObject({ token: 'token-B', userId: 2, user: null })
  })
})
