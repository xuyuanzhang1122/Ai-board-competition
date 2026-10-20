import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { AxiosError, AxiosHeaders } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api, TOKEN_KEY } from './client'

const originalAdapter = api.defaults.adapter

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

describe('admin API client', () => {
  beforeEach(() => {
    storage.clear()
    vi.clearAllMocks()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: localStorageMock,
    })
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { href: '/users', pathname: '/users' } },
    })
  })

  afterEach(() => {
    api.defaults.adapter = originalAdapter
  })

  it('只注入 admin_token 并解包 data', async () => {
    storage.set(TOKEN_KEY, 'admin-jwt')
    storage.set('token', 'user-jwt')
    let request: InternalAxiosRequestConfig | undefined

    api.defaults.adapter = async (config) => {
      request = config
      return {
        config,
        data: { code: 200, data: { adminId: 1 }, message: 'ok' },
        headers: new AxiosHeaders(),
        status: 200,
        statusText: 'OK',
      }
    }

    await expect(api.get('/admin/auth/me')).resolves.toEqual({ adminId: 1 })
    expect(request?.headers.get('Authorization')).toBe('Bearer admin-jwt')
  })

  it('业务 code 非 200 时拒绝', async () => {
    api.defaults.adapter = async (config) => ({
      config,
      data: { code: 400, data: null, message: '参数错误' },
      headers: new AxiosHeaders(),
      status: 200,
      statusText: 'OK',
    })

    await expect(api.get('/admin/users')).rejects.toThrow('参数错误')
  })

  it('HTTP 401 时清除 admin_token 并跳转登录', async () => {
    storage.set(TOKEN_KEY, 'expired-admin-jwt')
    storage.set('token', 'keep-user-jwt')

    api.defaults.adapter = async (config) => {
      const response: AxiosResponse = {
        config,
        data: { code: 401, data: null, message: '管理员登录已过期' },
        headers: new AxiosHeaders(),
        status: 401,
        statusText: 'Unauthorized',
      }
      throw new AxiosError('Unauthorized', AxiosError.ERR_BAD_REQUEST, config, undefined, response)
    }

    await expect(api.get('/admin/auth/me')).rejects.toThrow('管理员登录已过期')
    expect(storage.has(TOKEN_KEY)).toBe(false)
    expect(storage.get('token')).toBe('keep-user-jwt')
    expect(window.location.href).toBe('/login')
  })
})

it('stale unauthorized response does not clear the new admin session', async () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: localStorageMock })
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { href: '/knowledge', pathname: '/knowledge' } },
  })
  storage.set(TOKEN_KEY, 'old-admin')
  api.defaults.adapter = async (config) => {
    storage.set(TOKEN_KEY, 'new-admin')
    throw new AxiosError('Unauthorized', AxiosError.ERR_BAD_REQUEST, config, undefined, {
      config,
      data: { code: 401, message: '过期' },
      headers: new AxiosHeaders(),
      status: 401,
      statusText: 'Unauthorized',
    })
  }
  try {
    await expect(api.get('/admin/workbench/knowledge')).rejects.toThrow()
    expect(storage.get(TOKEN_KEY)).toBe('new-admin')
    expect(window.location.href).toBe('/knowledge')
  } finally {
    api.defaults.adapter = originalAdapter
  }
})

it('does not send a captured session token after the admin account changed', async () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: localStorageMock })
  storage.set(TOKEN_KEY, 'new-admin')
  let sent = false
  api.defaults.adapter = async config => {
    sent = true
    return { config, data: { code: 200, data: [], message: '' }, headers: new AxiosHeaders(), status: 200, statusText: 'OK' }
  }
  try {
    await expect(api.get('/admin/workbench/prompts', { headers: { Authorization: 'Bearer old-admin' } })).rejects.toThrow('登录状态已改变')
    expect(sent).toBe(false)
  } finally { api.defaults.adapter = originalAdapter }
})
