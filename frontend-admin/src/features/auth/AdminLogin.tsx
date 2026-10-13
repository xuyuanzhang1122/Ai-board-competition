import { Button, Input, InputPassword } from '@lobehub/ui'
import { App as AntdApp } from 'antd'
import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuthStore } from '@/shared/store/auth'

const DEVELOPER_GITHUB = 'https://github.com/xuyuanzhang1122?tab=repositories'

export function AdminLogin() {
  const { message } = AntdApp.useApp()
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)
  const [loading, setLoading] = useState(false)
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const canSubmit = Boolean(username.trim() && password)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit || loading) return

    setLoading(true)
    try {
      await login(username.trim(), password)
      navigate('/users', { replace: true })
    } catch (error) {
      message.error(error instanceof Error ? error.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-4 py-8 text-foreground">
      <form
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm"
        onSubmit={handleSubmit}
      >
        <div className="mb-7 flex items-center gap-3">
          <img alt="红鹦鹉漫剧" className="size-11 rounded-xl" src="/favicon.svg" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">红鹦鹉漫剧</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">管理后台</p>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <label className="flex flex-col gap-2 text-sm font-medium">
            用户名
            <Input
              autoFocus
              autoComplete="username"
              placeholder="管理员用户名"
              size="large"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            密码
            <InputPassword
              autoComplete="current-password"
              placeholder="密码"
              size="large"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <Button
            block
            disabled={!canSubmit}
            htmlType="submit"
            loading={loading}
            size="large"
            type="primary"
          >
            登录
          </Button>
        </div>
      </form>
      <p className="text-xs text-muted-foreground">
        © 2026 红鹦鹉漫剧 · 由 Xumy 开发 ·{' '}
        <a
          className="underline-offset-2 transition-colors hover:text-foreground hover:underline"
          href={DEVELOPER_GITHUB}
          rel="noopener noreferrer"
          target="_blank"
        >
          GitHub
        </a>
      </p>
    </main>
  )
}
