import { createBrowserRouter, Navigate } from 'react-router-dom'

import { AdminShell } from '@/app/AdminShell'
import { RedirectIfAuthed, RequireAuth } from '@/app/RouteGuards'
import { AdminLogin } from '@/features/auth/AdminLogin'
import { ModelConfig } from '@/features/models/ModelConfig'
import { UserManage } from '@/features/users/UserManage'
import { KnowledgeManage } from '@/features/workbench/KnowledgeManage'
import { PromptManage } from '@/features/workbench/PromptManage'

export const router = createBrowserRouter([
  {
    element: <RedirectIfAuthed />,
    children: [{ path: '/login', element: <AdminLogin /> }],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AdminShell />,
        children: [
          { index: true, element: <Navigate replace to="/users" /> },
          { path: '/users', element: <UserManage /> },
          { path: '/models', element: <ModelConfig /> },
          { path: '/knowledge', element: <KnowledgeManage /> },
          { path: '/prompts', element: <PromptManage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate replace to="/users" /> },
])
