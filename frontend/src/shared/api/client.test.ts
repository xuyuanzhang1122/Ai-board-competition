import { AxiosError } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { creationApi } from '@/features/creation/api'

import api from './client'

const session = vi.hoisted(() => {
  const values = new Map<string, string>()
  const store = { token: 'token-A', userId: 1, logout: vi.fn(), syncSession: vi.fn() }
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
  return { values, store }
})
vi.mock('@/shared/store/user', () => ({ useUserStore: { getState: () => session.store } }))
vi.mock('antd', () => ({ message: { error: vi.fn() } }))

beforeEach(() => {
  session.values.clear()
  session.values.set('token', 'token-A')
  session.values.set('user_id', '1')
  session.store.token = 'token-A'
  session.store.userId = 1
  vi.clearAllMocks()
})
const loginOtherTab = () => {
  session.values.set('token', 'token-B')
  session.values.set('user_id', '2')
}

describe('structured API rejection recovery', () => {
  it('retains an HTTP400 validation rejection code instead of network uncertainty', async () => {
    await expect(
      api.get('/synthetic-rejection', {
        adapter: async (config) => {
          throw new AxiosError(
            'Request failed with status code 400',
            'ERR_BAD_REQUEST',
            config,
            {},
            {
              config,
              data: { code: 40002, message: '消息内容不能超过10000字符' },
              headers: {},
              status: 400,
              statusText: 'Bad Request',
            },
          )
        },
      }),
    ).rejects.toMatchObject({ code: 40002, message: '消息内容不能超过10000字符' })
  })
  it('keeps transport uncertainty distinct from a definitive server rejection', async () => {
    await expect(
      api.get('/synthetic-drop', {
        adapter: async (config) => {
          throw new AxiosError('Network Error', 'ERR_NETWORK', config)
        },
      }),
    ).rejects.toMatchObject({ code: 'ERR_NETWORK' })
  })
})

describe('account session isolation at dispatch and response', () => {
  it('never sends an old tab private brief through the adapter after another tab logs in', async () => {
    loginOtherTab()
    const adapter = vi.fn(async (config) => ({
      config,
      data: { code: 200, data: { id: 3 } },
      headers: {},
      status: 200,
      statusText: 'OK',
    }))
    await expect(
      api.post('/creation/drafts', { brief: 'A private recovered brief' }, { adapter }),
    ).rejects.toMatchObject({ name: 'AccountSessionChangedError' })
    expect(adapter).not.toHaveBeenCalled()
  })
  it('blocks a restored create request even after the in-memory store already switched to B', async () => {
    const bound = creationApi.forSession({ token: 'token-A', userId: 1 })
    loginOtherTab()
    session.store.token = 'token-B'
    session.store.userId = 2
    const previous = api.defaults.adapter
    const adapter = vi.fn(async (config) => ({
      config,
      data: { code: 200, data: { id: 3 } },
      headers: {},
      status: 200,
      statusText: 'OK',
    }))
    api.defaults.adapter = adapter
    try {
      await expect(
        bound.create({
          requestId: 'original-A-uuid',
          brief: { theme: 'A private brief' } as never,
        }),
      ).rejects.toMatchObject({ name: 'AccountSessionChangedError' })
      expect(adapter).not.toHaveBeenCalled()
    } finally {
      api.defaults.adapter = previous
    }
  })
  it('preserves captured identity across the asynchronous interceptor window', async () => {
    const interceptor = api.interceptors.request.use(async (config) => {
      await Promise.resolve()
      loginOtherTab()
      return config
    })
    const adapter = vi.fn(async (config) => ({
      config,
      data: { code: 200, data: 'wrong account' },
      headers: {},
      status: 200,
      statusText: 'OK',
    }))
    try {
      await expect(
        api.post('/creation/drafts', { brief: 'A brief' }, {
          adapter,
          accountSession: { token: 'token-A', userId: 1 },
        } as Parameters<typeof api.post>[2]),
      ).rejects.toMatchObject({ name: 'AccountSessionChangedError' })
      expect(adapter).not.toHaveBeenCalled()
    } finally {
      api.interceptors.request.eject(interceptor)
    }
  })
  it('keeps Authorization bound to the captured identity and discards late responses after a switch', async () => {
    let complete!: () => void
    const request = api.get('/creation/drafts/1', {
      adapter: async (config) => {
        expect(config.headers.Authorization).toBe('Bearer token-A')
        await new Promise<void>((resolve) => {
          complete = resolve
        })
        return {
          config,
          data: { code: 200, data: { brief: 'private A' } },
          headers: {},
          status: 200,
          statusText: 'OK',
        }
      },
    })
    await vi.waitFor(() => expect(complete).toBeTypeOf('function'))
    loginOtherTab()
    complete()
    await expect(request).rejects.toMatchObject({ name: 'AccountSessionChangedError' })
  })
  it('does not let an old token 401 log out a new account', async () => {
    await expect(
      api.get('/creation/drafts/1', {
        adapter: async (config) => {
          loginOtherTab()
          session.store.token = 'token-B'
          session.store.userId = 2
          throw new AxiosError(
            'Unauthorized',
            'ERR_BAD_REQUEST',
            config,
            {},
            {
              config,
              data: { code: 40100, message: 'old token' },
              headers: {},
              status: 401,
              statusText: 'Unauthorized',
            },
          )
        },
      }),
    ).rejects.toMatchObject({ name: 'AccountSessionChangedError' })
    expect(session.store.logout).not.toHaveBeenCalled()
  })
  it('keeps public login requests usable while the stored account changes', async () => {
    loginOtherTab()
    await expect(
      api.post(
        '/auth/login',
        { username: 'B' },
        {
          adapter: async (config) => ({
            config,
            data: { code: 200, data: 'login response' },
            headers: {},
            status: 200,
            statusText: 'OK',
          }),
        },
      ),
    ).resolves.toBe('login response')
  })
})
