export interface AdminInfo {
  adminId: number
  displayName: string
  lastLoginAt: string | null
  token: string | null
  username: string
}

export interface PageResult<T> {
  current: number
  records: T[]
  size: number
  total: number
}

export interface UserListItem {
  avatarUrl: string | null
  balance: number
  createdAt: string
  id: number
  nickname: string | null
  phone: string | null
  status: number
  username: string | null
}

export interface UserSummary {
  assetCount: number
  jobCount: number
  orderCount: number
  projectCount: number
}

export interface UserDetail {
  avatarUrl: string | null
  balance: number
  createdAt: string
  id: number
  nickname: string | null
  phone: string | null
  status: number
  summary: UserSummary
  updatedAt: string
  username: string | null
}

export interface CreateUserPayload {
  avatarUrl?: string
  initialBalance?: number
  nickname?: string
  password: string
  username: string
}

export interface AiModel {
  code: string
  createdAt: string
  description: string | null
  enabled: number
  id: number
  name: string
  provider: string | null
  sortOrder: number
  type: string
  updatedAt: string
}

export interface ModelPayload {
  code: string
  description?: string
  enabled?: number
  name: string
  provider?: string
  sortOrder?: number
  type: string
}
