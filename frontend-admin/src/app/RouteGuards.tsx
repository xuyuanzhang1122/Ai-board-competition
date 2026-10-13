import { Navigate, Outlet } from 'react-router-dom'

import { useAuthStore } from '@/shared/store/auth'

export function RequireAuth() {
  const isAuthed = useAuthStore((state) => state.isAuthed)
  return isAuthed ? <Outlet /> : <Navigate replace to="/login" />
}

export function RedirectIfAuthed() {
  const isAuthed = useAuthStore((state) => state.isAuthed)
  return isAuthed ? <Navigate replace to="/users" /> : <Outlet />
}
