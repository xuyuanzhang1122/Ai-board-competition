import { beforeEach, describe, expect, it } from 'vitest'

import type { NativeOrderVO, RechargeProductVO } from '@/shared/types/api'

import { useRechargeUiStore } from './store'

const product: RechargeProductVO = {
  enabled: 1,
  id: 7,
  name: '轻量套餐',
  points: 100,
  priceCents: 1000,
  sortOrder: 1,
}

const order: NativeOrderVO = {
  amountCents: 1000,
  codeUrl: 'weixin://payment/example',
  expireAt: '2099-01-01T00:00:00Z',
  orderNo: 'ORDER-7',
  points: 100,
}

describe('recharge UI store', () => {
  beforeEach(() => useRechargeUiStore.getState().reset())

  it('keeps the selected product when a payment modal is closed', () => {
    useRechargeUiStore.getState().selectProduct(product)
    useRechargeUiStore.getState().openPayment(order)
    useRechargeUiStore.getState().clearPayment()

    expect(useRechargeUiStore.getState()).toMatchObject({
      currentOrder: null,
      paymentOpen: false,
      selectedProduct: product,
    })
  })

  it('clears the complete recharge flow after payment succeeds', () => {
    useRechargeUiStore.getState().selectProduct(product)
    useRechargeUiStore.getState().openPayment(order)
    useRechargeUiStore.getState().completePayment()

    expect(useRechargeUiStore.getState()).toMatchObject({
      currentOrder: null,
      paymentOpen: false,
      selectedProduct: null,
    })
  })
})
