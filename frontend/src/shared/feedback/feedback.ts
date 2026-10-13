export type FeedbackTone = 'error' | 'info' | 'success' | 'warning'

export interface ToastFeedback {
  id: number
  message: string
  tone: FeedbackTone
}

export interface ConfirmFeedbackOptions {
  cancelLabel?: string
  confirmLabel?: string
  danger?: boolean
  title?: string
}

export interface ConfirmFeedback extends Required<ConfirmFeedbackOptions> {
  id: number
  message: string
}

export interface FeedbackSnapshot {
  confirm: ConfirmFeedback | null
  toasts: ToastFeedback[]
}

let nextId = 1
let snapshot: FeedbackSnapshot = { confirm: null, toasts: [] }
let pendingConfirm: ((confirmed: boolean) => void) | null = null
const listeners = new Set<() => void>()
const toastTimers = new Map<number, ReturnType<typeof setTimeout>>()

const emit = () => {
  for (const listener of listeners) listener()
}

const setSnapshot = (next: FeedbackSnapshot) => {
  snapshot = next
  emit()
}

const dismissToast = (id: number) => {
  const timer = toastTimers.get(id)
  if (timer) clearTimeout(timer)
  toastTimers.delete(id)
  setSnapshot({ ...snapshot, toasts: snapshot.toasts.filter((toast) => toast.id !== id) })
}

const pushToast = (tone: FeedbackTone, message: string) => {
  const normalized = message.trim()
  if (!normalized) return
  const id = nextId++
  const toast = { id, message: normalized, tone }
  setSnapshot({ ...snapshot, toasts: [...snapshot.toasts.slice(-2), toast] })
  toastTimers.set(id, setTimeout(() => dismissToast(id), tone === 'error' ? 5200 : 3600))
}

export const feedback = {
  dismissToast,
  getSnapshot: () => snapshot,
  resolveConfirm(confirmed: boolean) {
    const resolve = pendingConfirm
    pendingConfirm = null
    setSnapshot({ ...snapshot, confirm: null })
    resolve?.(confirmed)
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

export const notify = {
  error: (message: string) => pushToast('error', message),
  info: (message: string) => pushToast('info', message),
  success: (message: string) => pushToast('success', message),
  warning: (message: string) => pushToast('warning', message),
}

export const confirmAction = (
  message: string,
  options: ConfirmFeedbackOptions = {},
): Promise<boolean> => {
  pendingConfirm?.(false)
  const confirm: ConfirmFeedback = {
    cancelLabel: options.cancelLabel ?? '取消',
    confirmLabel: options.confirmLabel ?? '确认',
    danger: options.danger ?? false,
    id: nextId++,
    message,
    title: options.title ?? '请确认操作',
  }
  setSnapshot({ ...snapshot, confirm })
  return new Promise<boolean>((resolve) => {
    pendingConfirm = resolve
  })
}
