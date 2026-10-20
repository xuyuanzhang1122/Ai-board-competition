import type { MenuItemType } from '@lobehub/ui'
import { Button, Layout, Menu } from '@lobehub/ui'
import { BookOpen, FileText, LogOut, Sparkles, UsersRound } from 'lucide-react'
import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

import { BRANDING } from '@/shared/constants/branding'
import { useAuthStore } from '@/shared/store/auth'

const NAV_ITEMS: MenuItemType[] = [
  { icon: UsersRound, key: '/users', label: '用户管理' },
  { icon: Sparkles, key: '/models', label: '模型配置' },
  { icon: BookOpen, key: '/knowledge', label: '知识审核' },
  { icon: FileText, key: '/prompts', label: '提示词版本' },
]

export function AdminShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const admin = useAuthStore((state) => state.admin)
  const displayName = useAuthStore((state) => state.displayName)
  const fetchMe = useAuthStore((state) => state.fetchMe)
  const logout = useAuthStore((state) => state.logout)

  useEffect(() => {
    if (!admin) void fetchMe().catch(() => undefined)
  }, [admin, fetchMe])

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <Layout
      asideWidth={220}
      headerHeight={64}
      header={
        <div className="flex h-full items-center justify-between border-b border-border bg-background/95 px-5 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <img alt={BRANDING.appName} className="size-9 rounded-lg" src="/favicon.svg" />
            <div className="flex flex-col leading-tight">
              <strong className="text-sm font-semibold">{BRANDING.appName}</strong>
              <span className="text-xs text-muted-foreground">管理后台 · {BRANDING.teamName}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{displayName}</span>
            <Button icon={LogOut} size="small" onClick={handleLogout}>
              退出登录
            </Button>
          </div>
        </div>
      }
      sidebar={
        <nav aria-label="管理后台导航" className="h-full border-r border-border bg-background p-3">
          <Menu
            items={NAV_ITEMS}
            selectedKeys={[location.pathname]}
            variant="borderless"
            onClick={({ key }) => navigate(String(key))}
          />
        </nav>
      }
    >
      <div className="flex min-h-[calc(100dvh-64px)] flex-col bg-muted/30 p-6 lg:p-8">
        <div className="flex-1">
          <Outlet />
        </div>
        <footer className="pt-8 text-center text-xs text-muted-foreground">
          {BRANDING.fullName}
          <br />
          {BRANDING.disclaimer}
        </footer>
      </div>
    </Layout>
  )
}
