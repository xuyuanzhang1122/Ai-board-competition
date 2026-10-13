import { Button, Modal } from '@lobehub/ui'
import QRCode from 'antd/es/qr-code'
import { Clock3 } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { NativeOrderVO, OrderStatusVO } from '@/shared/types/api'

import { rechargeApi } from '../api'

interface PaymentModalProps {
  onClose: () => void
  onExpired: () => void
  onFailed: (message: string) => void
  onSuccess: (status: OrderStatusVO) => void
  order: NativeOrderVO
}

function formatRemainingTime(secondsRemaining: number) {
  const hours = Math.floor(secondsRemaining / 3600)
  const minutes = Math.floor((secondsRemaining % 3600) / 60)
  const seconds = secondsRemaining % 60
  const minuteSeconds = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return hours > 0 ? `${hours}:${minuteSeconds}` : minuteSeconds
}

export function PaymentModal({
  onClose,
  onExpired,
  onFailed,
  onSuccess,
  order,
}: PaymentModalProps) {
  const [timeRemaining, setTimeRemaining] = useState(() =>
    Math.max(0, Math.floor((new Date(order.expireAt).getTime() - Date.now()) / 1000)),
  )

  useEffect(() => {
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      callback()
    }

    const checkOrderStatus = async () => {
      try {
        const status = await rechargeApi.getOrderStatus(order.orderNo)
        if (status.status === 'SUCCEEDED') finish(() => onSuccess(status))
        if (status.status === 'FAILED') finish(() => onFailed('支付失败'))
        if (status.status === 'CANCELED') finish(() => onFailed('订单已取消'))
      } catch (error) {
        console.error('[PaymentModal] Order status check failed:', error)
      }
    }

    const updateRemainingTime = () => {
      const seconds = Math.max(
        0,
        Math.floor((new Date(order.expireAt).getTime() - Date.now()) / 1000),
      )
      setTimeRemaining(seconds)
      if (seconds === 0) finish(onExpired)
    }

    void checkOrderStatus()
    const pollingInterval = window.setInterval(() => void checkOrderStatus(), 3000)
    const timerInterval = window.setInterval(updateRemainingTime, 1000)

    return () => {
      settled = true
      window.clearInterval(pollingInterval)
      window.clearInterval(timerInterval)
    }
  }, [onExpired, onFailed, onSuccess, order.expireAt, order.orderNo])

  return (
    <Modal
      centered
      open
      title="扫码支付"
      width={500}
      footer={
        <div className="flex justify-center">
          <Button onClick={onClose}>取消支付</Button>
        </div>
      }
      onCancel={onClose}
    >
      <div className="flex flex-col items-center pt-2">
        <div className="mb-6 w-full rounded-xl border border-border bg-muted/50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">订单金额</span>
            <span className="text-2xl font-semibold tabular-nums text-foreground">
              ¥{(order.amountCents / 100).toFixed(2)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">获得积分</span>
            <span className="text-base font-semibold text-foreground">
              {order.points.toLocaleString()} 积分
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-white p-3 shadow-sm">
          <QRCode bordered={false} size={256} type="svg" value={order.codeUrl} />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">请使用微信扫描二维码完成支付</p>
        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock3 aria-hidden className="size-4" />
          <span>订单剩余时间：{formatRemainingTime(timeRemaining)}</span>
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs text-foreground">
          <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
          <span>等待支付中...</span>
        </div>
      </div>
    </Modal>
  )
}
