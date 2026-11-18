import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'

import { MainLayout } from '@/app/MainLayout'
import { Placeholder } from '@/app/Placeholder'
import { LoginPage } from '@/features/auth/LoginPage'
import { useUserStore } from '@/shared/store/user'

// 认证守卫:无 token 跳登录(复刻旧 vue-router beforeEach)
function RequireAuth() {
  const token = useUserStore((s) => s.token)
  if (!token) return <Navigate replace to="/login" />
  return <Outlet />
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    hydrateFallbackElement: (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        页面加载中...
      </div>
    ),
    children: [
      {
        element: <MainLayout />,
        children: [
          { index: true, element: <Navigate replace to="/home" /> },
          {
            path: 'home',
            lazy: async () => {
              const { HomePage } = await import('@/features/home/HomePage')
              return { Component: HomePage }
            },
          },
          {
            path: 'brainstorm/:id?',
            lazy: async () => {
              const { BrainstormPage } = await import('@/features/brainstorm/BrainstormPage')
              return { Component: BrainstormPage }
            },
          },
          {
            path: 'creation/:id?',
            lazy: async () => {
              const { CreationPage } = await import('@/features/creation/CreationPage')
              return { Component: CreationPage }
            },
          },
          {
            path: 'toolbox/:id?',
            lazy: async () => {
              const { ToolboxPage } = await import('@/features/toolbox/ToolboxPage')
              return { Component: ToolboxPage }
            },
          },
          { path: 'wallet', element: <Navigate replace to="/home" /> },
          { path: 'recharge', element: <Navigate replace to="/home" /> },
          { path: 'invite', element: <Placeholder phase="Phase 1" title="邀请" /> },
        ],
      },
      {
        path: 'editor/:id',
        lazy: async () => {
          const { EditorPage } = await import('@/features/editor/EditorPage')
          return { Component: EditorPage }
        },
      },
    ],
  },
  { path: '*', element: <Navigate replace to="/home" /> },
])
