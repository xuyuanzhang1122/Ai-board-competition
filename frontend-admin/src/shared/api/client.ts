import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios'
import axios from 'axios'

interface Result<T> {
  code: number
  data: T
  message: string
}

export const TOKEN_KEY = 'admin_token'

export const api: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 30_000,
})

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem(TOKEN_KEY)
    const authorization = config.headers?.get('Authorization')
    if (authorization && authorization !== `Bearer ${token}`) {
      return Promise.reject(new Error('登录状态已改变，请重新打开页面'))
    }
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error: AxiosError) => Promise.reject(error),
)

api.interceptors.response.use(
  (response) => {
    const { code, data, message } = response.data as Result<unknown>
    if (code === 200) {
      return data as never
    }
    return Promise.reject(new Error(message || '操作失败'))
  },
  (error: AxiosError) => {
    const body = error.response?.data as Result<unknown> | undefined

    if (
      error.response?.status === 401 &&
      error.config?.headers.get('Authorization') === `Bearer ${localStorage.getItem(TOKEN_KEY)}`
    ) {
      localStorage.removeItem(TOKEN_KEY)
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
      return Promise.reject(new Error(body?.message || '登录已过期，请重新登录'))
    }

    return Promise.reject(new Error(body?.message || error.message || '网络错误'))
  },
)
