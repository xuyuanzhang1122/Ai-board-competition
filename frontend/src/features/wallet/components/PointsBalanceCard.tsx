import { Button, Skeleton } from '@lobehub/ui'
import { CircleAlert, LockKeyhole, Sparkles } from 'lucide-react'

import { Card } from '@/components/ui/card'
import type { WalletVO } from '@/shared/types/api'

interface PointsBalanceCardProps {
  error: string | null
  loading: boolean
  onRecharge: () => void
  onRetry: () => void
  wallet?: WalletVO
}

const EMPTY_WALLET: WalletVO = { balance: 0, frozenBalance: 0 }

export function PointsBalanceCard({
  error,
  loading,
  onRecharge,
  onRetry,
  wallet = EMPTY_WALLET,
}: PointsBalanceCardProps) {
  return (
    <Card className="gap-0 py-0 shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">积分余额</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">实时掌握可用与冻结积分</p>
        </div>
        <Button type="primary" onClick={onRecharge}>
          立即充值
        </Button>
      </div>

      {loading ? (
        <div className="px-6 py-8">
          <Skeleton active paragraph={{ rows: 3 }} title={false} />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <CircleAlert aria-hidden className="mb-3 size-9 text-destructive" />
          <p className="mb-4 text-sm text-muted-foreground">{error}</p>
          <Button onClick={onRetry}>重试</Button>
        </div>
      ) : (
        <>
          <div className="grid gap-4 p-6 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-muted/40 p-5">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Sparkles aria-hidden className="size-5" />
                </span>
                <div>
                  <p className="text-xs text-muted-foreground">可用积分</p>
                  <p className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">
                    {wallet.balance.toLocaleString()}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">可用于 AI 生成、工具箱等功能</p>
            </div>

            <div className="rounded-xl border border-border bg-background p-5">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <LockKeyhole aria-hidden className="size-5" />
                </span>
                <div>
                  <p className="text-xs text-muted-foreground">冻结积分</p>
                  <p className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">
                    {wallet.frozenBalance.toLocaleString()}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">任务进行中或待退款的积分</p>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-border px-6 py-4 text-sm">
            <span className="text-muted-foreground">总计</span>
            <span className="font-semibold tabular-nums text-foreground">
              {(wallet.balance + wallet.frozenBalance).toLocaleString()} 积分
            </span>
          </div>
        </>
      )}
    </Card>
  )
}
