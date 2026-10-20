import { message } from 'antd'
import type {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios'
import axios from 'axios'

import { API_CONFIG } from '@/shared/constants/config'
import { useUserStore } from '@/shared/store/user'
import type { Result } from '@/shared/types/api'

const api: AxiosInstance = axios.create({
  baseURL: API_CONFIG.baseURL,
  timeout: API_CONFIG.timeout,
})

// Preserve explicit server rejection codes for idempotent request recovery.
export class ApiBusinessError extends Error {
  readonly code: number
  constructor(code: number, message: string) {
    super(message)
    this.name = 'ApiBusinessError'
    this.code = code
  }
}

// 将技术性错误转换为用户友好的提示
const friendlyErrorMessage = (msg: string): string => {
  if (msg.includes('I/O error') || msg.includes('GOAWAY') || msg.includes('Connection refused')) {
    return 'AI服务暂时不可用，请稍后重试'
  }
  if (msg.includes('timeout') || msg.includes('Timeout')) {
    return '请求超时，请稍后重试'
  }
  if (msg.includes('调用失败') && msg.length > 50) {
    const colonIndex = msg.indexOf(':')
    if (colonIndex > 0 && colonIndex < 30) {
      return msg.slice(0, Math.max(0, colonIndex)) + '，请稍后重试'
    }
    return '服务调用失败，请稍后重试'
  }
  if (msg.includes('Network Error')) {
    return '网络连接失败，请检查网络'
  }
  return msg
}

export interface AccountSession {
  token: string
  userId: number | null
}
export type AccountRequestConfig = AxiosRequestConfig & { accountSession: AccountSession }
type BoundConfig = InternalAxiosRequestConfig & { accountSession?: AccountSession }

export class AccountSessionChangedError extends Error {
  constructor() {
    super('账号会话已变化，请在当前账号重新打开页面；原账号的编辑和请求恢复副本仍保留')
    this.name = 'AccountSessionChangedError'
  }
}

export function isAccountSessionCurrent(expected: AccountSession): boolean {
  const storedToken = localStorage.getItem('token') || ''
  const storedId = storedToken ? Number(localStorage.getItem('user_id')) || null : null
  const current = useUserStore.getState()
  return (
    current.token === expected.token &&
    current.userId === expected.userId &&
    storedToken === expected.token &&
    storedId === expected.userId
  )
}
function assertAccountSession(expected: AccountSession) {
  if (isAccountSessionCurrent(expected)) return
  useUserStore.getState().syncSession()
  throw new AccountSessionChangedError()
}
const publicAuthRequest = (url = '') =>
  /(?:^|\/)auth\/(?:login|phone\/(?:login|send-code))$/.test(url.split('?')[0])
const responseSession = (config?: InternalAxiosRequestConfig) =>
  (config as BoundConfig | undefined)?.accountSession

// Bind the expected account before dispatch; validate again at the actual adapter boundary.
// Creation callers supply their captured session, including when replaying a restored request.
api.interceptors.request.use(
  (config: BoundConfig) => {
    if (publicAuthRequest(config.url)) {
      config.headers.delete('Authorization')
      return config
    }
    const current = useUserStore.getState()
    const expected = Object.freeze({
      ...(config.accountSession ?? { token: current.token, userId: current.userId }),
    })
    assertAccountSession(expected)
    config.accountSession = expected
    const adapter = axios.getAdapter(config.adapter ?? api.defaults.adapter)
    config.adapter = (dispatchConfig) => {
      assertAccountSession(expected)
      if (expected.token) dispatchConfig.headers.set('Authorization', `Bearer ${expected.token}`)
      else dispatchConfig.headers.delete('Authorization')
      return adapter(dispatchConfig)
    }
    return config
  },
  (error: unknown) => {
    throw error
  },
  { synchronous: true },
)

// 响应拦截器 - 解包 Result 并统一错误处理
api.interceptors.response.use(
  (response) => {
    const expected = responseSession(response.config)
    if (expected) assertAccountSession(expected)
    if (response.config.responseType === 'blob' || response.config.responseType === 'arraybuffer') {
      return response.data as AxiosResponse
    }
    const { code, data, message: msg } = response.data as Result<unknown>
    if (code === 200) {
      // 拦截器直接返回解包后的 data;调用方以各自的业务类型消费
      return data as unknown as AxiosResponse
    }
    const friendlyMsg = friendlyErrorMessage(msg || '操作失败')
    console.error('[API Error]', msg)
    message.error(friendlyMsg)
    return Promise.reject(new ApiBusinessError(code, friendlyMsg))
  },
  (error: AxiosError | AccountSessionChangedError) => {
    if (error instanceof AccountSessionChangedError) return Promise.reject(error)
    const expected = responseSession(error.config)
    if (expected && !isAccountSessionCurrent(expected)) {
      useUserStore.getState().syncSession()
      return Promise.reject(new AccountSessionChangedError())
    }
    const body = error.response?.data as Result<unknown> | undefined
    if (error.response?.status === 401 && !publicAuthRequest(error.config?.url)) {
      // Token 失效 / 账号被删除或禁用:强制登出回登录页
      const reason = body?.message || '登录已过期，请重新登录'
      console.error('[Auth Error] 强制登出:', reason)
      useUserStore.getState().logout()
      message.error(reason)
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    } else {
      const friendlyMsg = friendlyErrorMessage(body?.message || error.message || '网络错误')
      console.error('[Network Error]', error.message)
      message.error(friendlyMsg)
    }
    if (body && typeof body.code === 'number') {
      return Promise.reject(
        new ApiBusinessError(body.code, friendlyErrorMessage(body.message || '操作失败')),
      )
    }
    return Promise.reject(error)
  },
)

export default api
