import { Button, Empty, Skeleton } from '@lobehub/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import App from 'antd/es/app'
import { CircleHelp, CreditCard } from 'lucide-react'
import { useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

import { Card } from '@/components/ui/card'
import { homeApi, homeQueryKeys } from '@/features/home/api'
import { useUserStore } from '@/shared/store/user'
import type { OrderStatusVO } from '@/shared/types/api'

import { rechargeApi, rechargeQueryKeys } from './api'
import { PaymentModal } from './components/PaymentModal'
import { ProductCard } from './components/ProductCard'
import { useRechargeUiStore } from './store'

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function RechargePage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const redirectTimerRef = useRef<number | null>(null)
  const points = useUserStore((state) => state.points)
  const setPoints = useUserStore((state) => state.setPoints)
  const currentOrder = useRechargeUiStore((state) => state.currentOrder)
  const paymentOpen = useRechargeUiStore((state) => state.paymentOpen)
  const selectedProduct = useRechargeUiStore((state) => state.selectedProduct)
  const clearPayment = useRechargeUiStore((state) => state.clearPayment)
  const completePayment = useRechargeUiStore((state) => state.completePayment)
  const openPayment = useRechargeUiStore((state) => state.openPayment)
  const resetRechargeUi = useRechargeUiStore((state) => state.reset)
  const selectProduct = useRechargeUiStore((state) => state.selectProduct)

  const productsQuery = useQuery({
    queryFn: rechargeApi.getProducts,
    queryKey: rechargeQueryKeys.products,
  })
  const walletQuery = useQuery({
    queryFn: homeApi.getWallet,
    queryKey: homeQueryKeys.wallet,
  })
  const createOrderMutation = useMutation({ mutationFn: rechargeApi.createOrder })

  useEffect(() => {
    if (walletQuery.data) setPoints(walletQuery.data.balance)
  }, [setPoints, walletQuery.data])

  useEffect(
    () => () => {
      resetRechargeUi()
      if (redirectTimerRef.current !== null) window.clearTimeout(redirectTimerRef.current)
    },
    [resetRechargeUi],
  )

  const handleConfirmRecharge = async () => {
    if (!selectedProduct || createOrderMutation.isPending) return
    try {
      const order = await createOrderMutation.mutateAsync({ productId: selectedProduct.id })
      openPayment(order)
    } catch (error) {
      void message.error(getErrorMessage(error, '创建订单失败'))
    }
  }

  const handlePaymentSuccess = useCallback(
    async (status: OrderStatusVO) => {
      completePayment()
      void message.success(`充值成功！获得${status.points}积分`)
      try {
        const wallet = await queryClient.fetchQuery({
          queryFn: homeApi.getWallet,
          queryKey: homeQueryKeys.wallet,
        })
        setPoints(wallet.balance)
      } catch (error) {
        console.error('[RechargePage] Failed to refresh wallet balance:', error)
      }
      redirectTimerRef.current = window.setTimeout(() => navigate('/wallet'), 1500)
    },
    [completePayment, message, navigate, queryClient, setPoints],
  )

  const handlePaymentFailed = useCallback(
    (error: string) => {
      clearPayment()
      void message.error(error)
    },
    [clearPayment, message],
  )

  const handlePaymentExpired = useCallback(() => {
    clearPayment()
    void message.warning('订单已过期，请重新下单')
  }, [clearPayment, message])

  const products = productsQuery.data ?? []

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-7">
      <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">积分充值</h1>
          <p className="mt-1 text-sm text-muted-foreground">选择充值套餐，使用微信扫码支付</p>
        </div>
        <Card className="min-w-52 gap-0 px-5 py-3 shadow-sm">
          <span className="text-xs text-muted-foreground">当前余额</span>
          <span className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {walletQuery.isPending ? '—' : points.toLocaleString()} 积分
          </span>
        </Card>
      </header>

      {productsQuery.isPending ? (
        <div className="py-10">
          <Skeleton active title paragraph={{ rows: 8 }} />
        </div>
      ) : productsQuery.isError ? (
        <Card className="items-center px-6 py-14 text-center shadow-sm">
          <CircleHelp aria-hidden className="size-11 text-muted-foreground" />
          <div>
            <p className="font-medium text-foreground">充值套餐加载失败</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {getErrorMessage(productsQuery.error, '请稍后再试')}
            </p>
          </div>
          <Button onClick={() => void productsQuery.refetch()}>重新加载</Button>
        </Card>
      ) : products.length === 0 ? (
        <Empty
          className="py-24"
          description="请稍后再试"
          icon={CreditCard}
          title="暂无充值套餐"
        />
      ) : (
        <>
          <section>
            <h2 className="mb-4 text-base font-semibold text-foreground">选择充值套餐</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  selected={selectedProduct?.id === product.id}
                  onSelect={selectProduct}
                />
              ))}
            </div>
          </section>

          {selectedProduct ? (
            <Card className="mx-auto max-w-md gap-0 px-6 py-6 shadow-sm">
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">已选套餐</span>
                  <span className="font-medium text-foreground">{selectedProduct.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">支付金额</span>
                  <span className="text-xl font-semibold tabular-nums text-foreground">
                    ¥{(selectedProduct.priceCents / 100).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">获得积分</span>
                  <span className="font-semibold text-foreground">
                    {selectedProduct.points.toLocaleString()} 积分
                  </span>
                </div>
              </div>
              <Button
                block
                className="mt-5"
                loading={createOrderMutation.isPending}
                type="primary"
                onClick={() => void handleConfirmRecharge()}
              >
                {createOrderMutation.isPending ? '创建订单中...' : '立即充值'}
              </Button>
            </Card>
          ) : null}

          <Card className="gap-0 px-6 py-5 shadow-sm">
            <h3 className="flex items-center gap-2 font-medium text-foreground">
              <CircleHelp aria-hidden className="size-5 text-muted-foreground" />
              温馨提示
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>• 支付完成后积分将立即到账</li>
              <li>• 订单有效期为2小时，请在有效期内完成支付</li>
              <li>• 如遇支付问题，请联系客服</li>
              <li>• 充值后的积分不可提现，仅可用于平台消费</li>
            </ul>
          </Card>
        </>
      )}

      {paymentOpen && currentOrder ? (
        <PaymentModal
          order={currentOrder}
          onClose={clearPayment}
          onExpired={handlePaymentExpired}
          onFailed={handlePaymentFailed}
          onSuccess={handlePaymentSuccess}
        />
      ) : null}
    </div>
  )
}
