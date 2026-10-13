import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useSyncExternalStore } from 'react'

import { feedback, type FeedbackTone } from './feedback'

const TONE_META: Record<FeedbackTone, { className: string; icon: typeof Info; label: string }> = {
  error: { className: 'border-rose-200 text-rose-600', icon: XCircle, label: '错误' },
  info: { className: 'border-sky-200 text-sky-600', icon: Info, label: '提示' },
  success: { className: 'border-emerald-200 text-emerald-600', icon: CheckCircle2, label: '成功' },
  warning: { className: 'border-amber-200 text-amber-600', icon: AlertTriangle, label: '注意' },
}

export function FeedbackHost() {
  const snapshot = useSyncExternalStore(feedback.subscribe, feedback.getSnapshot, feedback.getSnapshot)

  return (
    <>
      <div
        aria-live="polite"
        className="pointer-events-none fixed left-1/2 top-1/2 z-[2200] flex w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-2"
      >
        {snapshot.toasts.map((toast) => {
          const meta = TONE_META[toast.tone]
          const Icon = meta.icon
          return (
            <div
              className={`pointer-events-auto flex items-start gap-3 rounded-2xl border bg-white/95 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.22)] backdrop-blur-xl ${meta.className}`}
              key={toast.id}
              role={toast.tone === 'error' ? 'alert' : 'status'}
            >
              <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold tracking-wide">{meta.label}</p>
                <p className="mt-0.5 break-words text-sm leading-6 text-slate-700">{toast.message}</p>
              </div>
              <button
                aria-label="关闭提示"
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                type="button"
                onClick={() => feedback.dismissToast(toast.id)}
              >
                <X className="size-4" />
              </button>
            </div>
          )
        })}
      </div>

      {snapshot.confirm ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-[2300] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm"
          role="dialog"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) feedback.resolveConfirm(false)
          }}
        >
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/70 bg-white shadow-[0_32px_110px_rgba(15,23,42,0.28)]">
            <div className="flex items-start gap-4 p-6">
              <div className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${snapshot.confirm.danger ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
                <AlertTriangle className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-slate-900">{snapshot.confirm.title}</h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{snapshot.confirm.message}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-6 py-4">
              <button
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                type="button"
                onClick={() => feedback.resolveConfirm(false)}
              >
                {snapshot.confirm.cancelLabel}
              </button>
              <button
                autoFocus
                className={`rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition ${snapshot.confirm.danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-900 hover:bg-slate-800'}`}
                type="button"
                onClick={() => feedback.resolveConfirm(true)}
              >
                {snapshot.confirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
