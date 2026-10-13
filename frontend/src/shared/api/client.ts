import { message } from 'antd'
import type { AxiosError, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import axios from 'axios'

import { API_CONFIG } from '@/shared/constants/config'
import { useUserStore } from '@/shared/store/user'
import type { Result } from '@/shared/types/api'

const api: AxiosInstance = axios.create({
  baseURL: API_CONFIG.baseURL,
  timeout: API_CONFIG.timeout,
})

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

// 请求拦截器 - 注入 JWT
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token')
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error: AxiosError) => Promise.reject(error),
)

// 响应拦截器 - 解包 Result 并统一错误处理
api.interceptors.response.use(
  (response) => {
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
    return Promise.reject(new Error(friendlyMsg))
  },
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Token 失效 / 账号被删除或禁用:强制登出回登录页
      const body = error.response?.data as Result<unknown> | undefined
      const reason = body?.message || '登录已过期，请重新登录'
      console.error('[Auth Error] 强制登出:', reason)
      useUserStore.getState().logout()
      message.error(reason)
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    } else {
      const friendlyMsg = friendlyErrorMessage(error.message || '网络错误')
      console.error('[Network Error]', error.message)
      message.error(friendlyMsg)
    }
    return Promise.reject(error)
  },
)

export default api
