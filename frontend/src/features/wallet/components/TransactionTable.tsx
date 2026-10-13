import { Button, Empty, Segmented, Skeleton } from '@lobehub/ui'
import { useQuery } from '@tanstack/react-query'
import { ReceiptText } from 'lucide-react'

import { Card } from '@/components/ui/card'

import { walletApi, walletQueryKeys, type WalletTransaction } from '../api'
import { useWalletUiStore,type WalletFilter } from '../store'

const PAGE_SIZE = 10

const FILTER_OPTIONS: { label: string; value: WalletFilter }[] = [
  { label: '全部', value: 'ALL' },
  { label: '充值', value: 'RECHARGE' },
  { label: '消费', value: 'CONSUME' },
  { label: '奖励', value: 'REWARD' },
]

function matchesFilter(transaction: WalletTransaction, filter: WalletFilter) {
  if (filter === 'ALL') return true
  const type = transaction.type.toUpperCase()
  const aliases: Record<Exclude<WalletFilter, 'ALL'>, string[]> = {
    CONSUME: ['CONSUME', '消费'],
    RECHARGE: ['RECHARGE', '充值'],
    REWARD: ['REWARD', '奖励'],
  }
  return aliases[filter].some((alias) => type.includes(alias))
}

function getTypeBadge(type: string) {
  const value = type.toUpperCase()
  if (value.includes('RECHARGE') || value.includes('充值')) {
    return { className: 'bg-emerald-50 text-emerald-700', text: '充值' }
  }
  if (value.includes('CONSUME') || value.includes('消费')) {
    return { className: 'bg-red-50 text-red-700', text: '消费' }
  }
  if (value.includes('REWARD') || value.includes('奖励')) {
    return { className: 'bg-amber-50 text-amber-700', text: '奖励' }
  }
  if (value.includes('REFUND') || value.includes('退款')) {
    return { className: 'bg-blue-50 text-blue-700', text: '退款' }
  }
  return { className: 'bg-muted text-muted-foreground', text: type }
}

function formatAmount(amount: number) {
  return amount > 0 ? `+${amount.toLocaleString()}` : amount.toLocaleString()
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function parseMetadata(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null) return value as Record<string, unknown>
  if (typeof value !== 'string') return null

  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function formatDescription(transaction: WalletTransaction) {
  if (transaction.description && transaction.description !== '(无描述)') {
    return transaction.description
  }
  if (transaction.bizType !== 'JOB') return transaction.description || '(无描述)'

  const metadata = parseMetadata(transaction.metaJson)
  if (metadata?.videoUrl || metadata?.duration) return '视频生成'
  if (metadata?.maxTokens !== undefined || metadata?.temperature !== undefined) return '文本生成'
  if (metadata?.aspectRatio || metadata?.referenceImage) return '图片生成'
  return '任务消费'
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '获取流水记录失败'
}

export function TransactionTable() {
  const currentPage = useWalletUiStore((state) => state.currentPage)
  const filter = useWalletUiStore((state) => state.filter)
  const setCurrentPage = useWalletUiStore((state) => state.setCurrentPage)
  const setFilter = useWalletUiStore((state) => state.setFilter)
  const transactionsQuery = useQuery({
    queryFn: () => walletApi.getTransactions({ page: currentPage, size: PAGE_SIZE }),
    queryKey: walletQueryKeys.transactions(currentPage, PAGE_SIZE),
  })

  const records = transactionsQuery.data?.records ?? []
  const filteredTransactions = records.filter((transaction) => matchesFilter(transaction, filter))
  const total = transactionsQuery.data?.total ?? 0
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1)

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">流水记录</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">充值、消费与奖励明细</p>
        </div>
        <Segmented
          options={FILTER_OPTIONS}
          value={filter}
          variant="filled"
          onChange={(value) => setFilter(value as WalletFilter)}
        />
      </div>

      {transactionsQuery.isPending ? (
        <div className="px-6 py-8">
          <Skeleton active paragraph={{ rows: 5 }} title={false} />
        </div>
      ) : transactionsQuery.isError ? (
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <p className="mb-4 text-sm text-muted-foreground">
            {getErrorMessage(transactionsQuery.error)}
          </p>
          <Button onClick={() => void transactionsQuery.refetch()}>重试</Button>
        </div>
      ) : filteredTransactions.length === 0 ? (
        <Empty
          className="py-12"
          description={filter === 'ALL' ? '还没有积分流水' : '当前页没有该类型记录'}
          icon={ReceiptText}
          title="暂无流水记录"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">
                <th className="px-6 py-3">类型</th>
                <th className="px-4 py-3">金额</th>
                <th className="px-4 py-3">余额</th>
                <th className="px-4 py-3">描述</th>
                <th className="px-6 py-3">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredTransactions.map((transaction) => {
                const badge = getTypeBadge(transaction.type)
                return (
                  <tr className="transition-colors hover:bg-muted/30" key={transaction.id}>
                    <td className="px-6 py-4">
                      <span className={`rounded-md px-2 py-1 text-xs font-medium ${badge.className}`}>
                        {badge.text}
                      </span>
                    </td>
                    <td
                      className={`px-4 py-4 text-sm font-semibold tabular-nums ${
                        transaction.amount > 0 ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {formatAmount(transaction.amount)}
                    </td>
                    <td className="px-4 py-4 text-sm tabular-nums text-foreground">
                      {transaction.balance.toLocaleString()}
                    </td>
                    <td className="max-w-[260px] truncate px-4 py-4 text-sm text-muted-foreground">
                      {formatDescription(transaction)}
                    </td>
                    <td className="px-6 py-4 text-xs text-muted-foreground">
                      {formatDate(transaction.createdAt)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!transactionsQuery.isPending && !transactionsQuery.isError && records.length > 0 ? (
        <div className="flex items-center justify-between border-t border-border px-6 py-3 text-sm text-muted-foreground">
          <span>共 {total} 条记录</span>
          <div className="flex items-center gap-2">
            <Button
              disabled={currentPage === 1}
              size="small"
              onClick={() => setCurrentPage(currentPage - 1)}
            >
              上一页
            </Button>
            <span className="min-w-16 text-center tabular-nums">
              {currentPage} / {totalPages}
            </span>
            <Button
              disabled={currentPage >= totalPages}
              size="small"
              onClick={() => setCurrentPage(currentPage + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  )
}
