import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { homeApi, homeQueryKeys } from '@/features/home/api'
import { useUserStore } from '@/shared/store/user'
import type { WalletVO } from '@/shared/types/api'

import { PointsBalanceCard } from './components/PointsBalanceCard'
import { TransactionTable } from './components/TransactionTable'
import { useWalletUiStore } from './store'

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '获取余额失败'
}

export function WalletPage() {
  const navigate = useNavigate()
  const resetWalletUi = useWalletUiStore((state) => state.reset)
  const setPoints = useUserStore((state) => state.setPoints)
  const walletQuery = useQuery({
    queryFn: homeApi.getWallet,
    queryKey: homeQueryKeys.wallet,
  })

  useEffect(() => {
    if (walletQuery.data) setPoints(walletQuery.data.balance)
  }, [setPoints, walletQuery.data])

  useEffect(() => resetWalletUi, [resetWalletUi])

  const wallet: WalletVO | undefined = walletQuery.data
    ? {
        balance: walletQuery.data.balance ?? 0,
        // 冻结后端当前只返回 balance；延续旧 wallet API 的兼容行为。
        frozenBalance: walletQuery.data.frozenBalance ?? 0,
      }
    : undefined

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">我的钱包</h1>
        <p className="mt-1 text-sm text-muted-foreground">查看积分余额和消费记录</p>
      </header>

      <PointsBalanceCard
        error={walletQuery.isError ? getErrorMessage(walletQuery.error) : null}
        loading={walletQuery.isPending}
        wallet={wallet}
        onRecharge={() => navigate('/recharge')}
        onRetry={() => void walletQuery.refetch()}
      />
      <TransactionTable />
    </div>
  )
}
