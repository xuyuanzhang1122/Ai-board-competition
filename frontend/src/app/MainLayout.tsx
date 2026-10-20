import { Button, Input, Modal } from '@lobehub/ui'
import {
  ChevronRight,
  CircleDollarSign,
  Home,
  LogOut,
  Sparkles,
  Upload,
  Users,
  WalletCards,
} from 'lucide-react'
import { type ChangeEvent, type ComponentType, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

import logo from '@/assets/logo.svg'
import { cn } from '@/lib/utils'
import { BRANDING } from '@/shared/constants/config'
import { FEATURE_FLAGS, type FeatureKey } from '@/shared/constants/features'
import { notify } from '@/shared/feedback/feedback'
import { useUserStore } from '@/shared/store/user'

const NAV: {
  icon: ComponentType<{ className?: string; size?: number }>
  key: FeatureKey
  label: string
  to: string
}[] = [
  { icon: Home, key: 'home', label: '首页', to: '/home' },
  { icon: Sparkles, key: 'toolbox', label: 'AI 工具箱', to: '/toolbox' },
  { icon: WalletCards, key: 'wallet', label: '钱包', to: '/wallet' },
  { icon: CircleDollarSign, key: 'recharge', label: '充值', to: '/recharge' },
  { icon: Users, key: 'invite', label: '邀请', to: '/invite' },
]

const MAX_AVATAR_SIZE = 5 * 1024 * 1024

export function MainLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const logout = useUserStore((state) => state.logout)
  const fetchProfile = useUserStore((state) => state.fetchProfile)
  const updateProfile = useUserStore((state) => state.updateProfile)
  const user = useUserStore((state) => state.user)
  const [profileOpen, setProfileOpen] = useState(false)
  const [nickname, setNickname] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const usesOwnScroller = location.pathname === '/toolbox' || location.pathname === '/home'

  useEffect(() => {
    if (user) return
    void fetchProfile().catch(() => undefined)
  }, [fetchProfile, user])

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const openProfile = () => {
    setNickname(user?.nickname ?? '')
    setAvatarUrl(user?.avatarUrl ?? '')
    setProfileOpen(true)
  }

  const handleAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > MAX_AVATAR_SIZE) {
      notify.warning('头像文件不能超过 5MB')
      return
    }
    setUploading(true)
    try {
      const { authApi } = await import('@/shared/api/auth')
      setAvatarUrl(await authApi.uploadAvatar(file))
      notify.success('头像上传成功，保存后生效')
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '头像上传失败')
    } finally {
      setUploading(false)
    }
  }

  const saveProfile = async () => {
    const name = nickname.trim()
    if (name.length < 2 || name.length > 20) {
      notify.warning('昵称长度需为 2–20 个字符')
      return
    }
    setSaving(true)
    try {
      await updateProfile({ avatarUrl: avatarUrl || undefined, nickname: name })
      setProfileOpen(false)
      notify.success('个人资料已更新')
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '个人资料保存失败')
    } finally {
      setSaving(false)
    }
  }

  const displayName = user?.nickname || '创作者'

  return (
    <div className="flex h-screen bg-[#f7f7f8] text-foreground">
      <aside className="relative flex w-[248px] shrink-0 flex-col overflow-hidden border-r border-rose-100/70 bg-[linear-gradient(180deg,#fffaf7_0%,#fff_42%,#fff8f5_100%)]">
        <div className="pointer-events-none absolute -left-16 top-20 size-48 rounded-full bg-rose-200/20 blur-3xl" />
        <div className="relative flex items-center gap-3 border-b border-rose-100/70 px-5 py-5">
          <img alt={BRANDING.appName} className="size-11 rounded-[14px] shadow-sm" src={logo} />
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold tracking-tight text-slate-900">{BRANDING.appName}</h1>
            <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">{BRANDING.teamName}</p>
          </div>
        </div>

        <div className="relative px-5 pb-2 pt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">创作空间</div>
        <nav className="relative flex flex-col gap-1.5 px-3">
          {NAV.filter((item) => FEATURE_FLAGS[item.key]).map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 transition-all duration-200 hover:bg-white hover:text-slate-900 hover:shadow-sm',
                    isActive &&
                      'bg-[linear-gradient(135deg,#fb7185,#f97316)] text-white shadow-[0_10px_30px_rgba(244,63,94,0.22)] hover:text-white',
                  )
                }
              >
                <Icon aria-hidden className="size-[18px]" size={18} />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="relative mt-auto px-3 pb-4 pt-4">
          <button
            className="group w-full rounded-2xl border border-rose-100 bg-white/85 p-3 text-left shadow-[0_10px_32px_rgba(15,23,42,0.06)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-[0_14px_38px_rgba(244,63,94,0.10)]"
            type="button"
            onClick={openProfile}
          >
            <div className="flex items-center gap-3">
              <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[linear-gradient(135deg,#ffe4e6,#ffedd5)] text-sm font-bold text-rose-600">
                {user?.avatarUrl ? (
                  <img alt={displayName} className="size-full object-cover" src={user.avatarUrl} />
                ) : (
                  displayName.slice(0, 1).toUpperCase()
                )}
                <span className="absolute bottom-0.5 right-0.5 size-2.5 rounded-full border-2 border-white bg-emerald-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">{displayName}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-600">
                  参赛免费 · 点击编辑
                </p>
              </div>
              <ChevronRight className="size-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-rose-400" />
            </div>
          </button>
          <button
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-slate-400 transition hover:bg-white hover:text-slate-700"
            type="button"
            onClick={handleLogout}
          >
            <LogOut className="size-3.5" /> 退出登录
          </button>
          <p className="mt-2 text-center text-[10px] text-slate-300">
            你的不对我的队 · 参赛展示版
          </p>
        </div>
      </aside>

      <main className={cn('min-w-0 flex-1', usesOwnScroller ? 'overflow-hidden' : 'overflow-auto p-6')}>
        <Outlet />
      </main>

      <Modal
        centered
        open={profileOpen}
        title="编辑个人资料"
        width={460}
        footer={
          <div className="flex justify-end gap-2">
            <Button disabled={saving} onClick={() => setProfileOpen(false)}>取消</Button>
            <Button loading={saving} type="primary" onClick={() => void saveProfile()}>保存资料</Button>
          </div>
        }
        onCancel={() => setProfileOpen(false)}
      >
        <div className="flex flex-col gap-5 py-2">
          <div className="flex flex-col items-center gap-3">
            <div className="flex size-24 items-center justify-center overflow-hidden rounded-3xl border border-rose-100 bg-[linear-gradient(135deg,#fff1f2,#fff7ed)] text-3xl font-bold text-rose-500">
              {avatarUrl ? <img alt="头像预览" className="size-full object-cover" src={avatarUrl} /> : (nickname || '?').slice(0, 1)}
            </div>
            <input accept="image/*" className="hidden" ref={avatarInputRef} type="file" onChange={(event) => void handleAvatarUpload(event)} />
            <Button icon={Upload} loading={uploading} onClick={() => avatarInputRef.current?.click()}>更换头像</Button>
            <p className="text-xs text-slate-400">支持 JPG、PNG，最大 5MB</p>
          </div>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            <span>昵称</span>
            <Input maxLength={20} value={nickname} onChange={(event) => setNickname(event.target.value)} />
          </label>
        </div>
      </Modal>
    </div>
  )
}
