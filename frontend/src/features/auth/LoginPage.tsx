import { Button } from '@lobehub/ui'
// lobehub 未提供独立的密码输入框,按铁则回退到其底座 antd
import { Input, message } from 'antd'
import { type FormEvent,useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { BRANDING } from '@/shared/constants/config'
import { useUserStore } from '@/shared/store/user'

export function LoginPage() {
  const navigate = useNavigate()
  const loginWithPassword = useUserStore((s) => s.loginWithPassword)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!username || !password) {
      message.warning('请输入用户名和密码')
      return
    }
    try {
      setLoading(true)
      await loginWithPassword(username, password)
      message.success('登录成功')
      navigate('/home', { replace: true })
    } catch {
      // 错误提示已由 axios 拦截器统一处理
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <form
        autoComplete="off"
        className="flex w-full max-w-sm flex-col gap-5 rounded-xl border border-border bg-card p-8 shadow-sm"
        onSubmit={handleSubmit}
      >
        <div className="flex flex-col gap-1 text-center">
          <h1 className="text-xl font-semibold">{BRANDING.appName}</h1>
          <p className="text-sm font-medium">{BRANDING.teamName}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{BRANDING.competition}</p>
          <p className="text-sm text-muted-foreground">登录以继续</p>
        </div>
        <Input
          autoComplete="off"
          data-1p-ignore="true"
          data-lpignore="true"
          name="login_identity"
          placeholder="用户名"
          size="large"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <Input.Password
          autoComplete="new-password"
          data-1p-ignore="true"
          data-lpignore="true"
          name="login_secret"
          placeholder="密码"
          size="large"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button block htmlType="submit" loading={loading} size="large" type="primary">
          登录
        </Button>
        <p className="text-center text-xs leading-relaxed text-muted-foreground">{BRANDING.disclaimer}</p>
      </form>
    </div>
  )
}
