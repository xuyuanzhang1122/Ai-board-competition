import { Alert, Button, Input } from 'antd'
import type { ReactNode } from 'react'

import { useAuthStore } from '@/shared/store/auth'

export function SessionPage({ children }: { children: (token: string) => ReactNode }) {
  const token = useAuthStore((state) => state.token)
  return <div key={token}>{children(token)}</div>
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      {children}
    </label>
  )
}
export function TextField({
  label,
  value,
  onChange,
  multiline = false,
  required = false,
  type = 'text',
  disabled = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  multiline?: boolean
  required?: boolean
  type?: string
  disabled?: boolean
}) {
  return (
    <Field label={label}>
      {multiline ? (
        <Input.TextArea
          aria-label={label}
          disabled={disabled}
          required={required}
          rows={5}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input
          aria-label={label}
          disabled={disabled}
          required={required}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  )
}
export function ErrorNotice({ error }: { error: string }) {
  return error ? (
    <Alert
      showIcon
      className="mb-4"
      description={`${error}。输入已保留；若版本冲突，请复制当前内容后重新载入记录。`}
      type="error"
    />
  ) : null
}
export function ReloadButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <Button disabled={busy} onClick={onClick}>
      刷新列表（保留编辑）
    </Button>
  )
}
