import { notify } from '@/shared/feedback/feedback'

export interface Notifier {
  error: (message: string) => void
  info: (message: string) => void
  success: (message: string) => void
  warning: (message: string) => void
}

const noop = () => undefined

export const defaultNotifier: Notifier = {
  error: notify.error,
  info: notify.info,
  success: notify.success,
  warning: notify.warning,
}

export const silentNotifier: Notifier = {
  error: noop,
  info: noop,
  success: noop,
  warning: noop,
}
