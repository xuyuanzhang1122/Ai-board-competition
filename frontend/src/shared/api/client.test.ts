import { AxiosError } from 'axios'
import { describe, expect, it, vi } from 'vitest'

import api from './client'

vi.hoisted(() => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } })

})
vi.mock('@/shared/store/user', () => ({ useUserStore: { getState: () => ({ logout: vi.fn() }) } }))
vi.mock('antd', () => ({ message: { error: vi.fn() } }))

describe('structured API rejection recovery', () => {
  it('retains an HTTP400 validation rejection code instead of network uncertainty', async () => {
    await expect(api.get('/synthetic-rejection', {
      adapter: async (config) => { throw new AxiosError('Request failed with status code 400', 'ERR_BAD_REQUEST', config, {}, {
        config, data: { code: 40002, message: '消息内容不能超过10000字符' }, headers: {}, status: 400, statusText: 'Bad Request',
      }) },
    })).rejects.toMatchObject({ code: 40002, message: '消息内容不能超过10000字符' })
  })
  it('keeps transport uncertainty distinct from a definitive server rejection', async () => {
    await expect(api.get('/synthetic-drop', {
      adapter: async (config) => { throw new AxiosError('Network Error', 'ERR_NETWORK', config) },
    })).rejects.toMatchObject({ code: 'ERR_NETWORK' })
  })
})
