import api from './client'
import type {
  SendCodeRequest,
  LoginRequest,
  UsernameLoginRequest,
  LoginResponse,
  UserVO,
  UpdateProfileRequest,
} from '@/shared/types/api'

export const authApi = {
  /** 用户名 + 密码登录 */
  loginWithPassword(data: UsernameLoginRequest): Promise<LoginResponse> {
    return api.post('/auth/login', data)
  },

  /** 发送验证码(旧手机流程,UI 已不用) */
  sendCode(data: SendCodeRequest): Promise<void> {
    return api.post('/auth/phone/send-code', data)
  },

  /** 手机登录(旧流程,保留后端兼容) */
  login(data: LoginRequest): Promise<LoginResponse> {
    return api.post('/auth/phone/login', data)
  },

  /** 获取用户资料 */
  getProfile(): Promise<UserVO> {
    return api.get('/user/profile')
  },

  /** 更新用户资料 */
  updateProfile(data: UpdateProfileRequest): Promise<UserVO | null> {
    return api.put('/user/profile', data)
  },

  /** 上传头像 */
  uploadAvatar(file: File): Promise<string> {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/user/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}
