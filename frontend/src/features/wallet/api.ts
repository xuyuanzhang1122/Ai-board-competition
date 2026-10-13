import api from '@/shared/api/client'
import type { PageResult, TransactionVO } from '@/shared/types/api'

export interface WalletTransaction extends TransactionVO {
  bizType?: string
  metaJson?: unknown
}

interface RawTransaction {
  amount?: number | null
  balanceAfter?: number | null
  bizType?: string | null
  createdAt?: string | null
  createTime?: string | null
  description?: string | null
  id: number
  metaJson?: unknown
  remark?: string | null
  type?: string | null
}

type RawTransactionPage = Omit<PageResult<RawTransaction>, 'records'> & {
  records?: RawTransaction[] | null
}

export const walletApi = {
  async getTransactions(params: { page: number; size: number }): Promise<PageResult<WalletTransaction>> {
    const result: RawTransactionPage = await api.get('/wallet/transactions', { params })

    return {
      ...result,
      records: (result.records ?? []).map((item) => ({
        amount: item.amount ?? 0,
        balance: item.balanceAfter ?? 0,
        bizType: item.bizType ?? undefined,
        createdAt: item.createdAt ?? item.createTime ?? new Date().toISOString(),
        description: item.description ?? item.remark ?? '(无描述)',
        id: item.id,
        metaJson: item.metaJson,
        type: item.type ?? 'UNKNOWN',
      })),
    }
  },
}

export const walletQueryKeys = {
  transactions: (page: number, size: number) => ['wallet', 'transactions', { page, size }] as const,
}
