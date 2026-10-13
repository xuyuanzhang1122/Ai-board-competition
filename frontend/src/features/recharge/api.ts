import api from '@/shared/api/client'
import type {
  CreateOrderRequest,
  ExchangeRuleVO,
  NativeOrderVO,
  OrderStatusVO,
  RechargeProductVO,
} from '@/shared/types/api'

export const rechargeApi = {
  createOrder(data: CreateOrderRequest): Promise<NativeOrderVO> {
    return api.post('/recharge/orders', data)
  },

  getExchangeRules(): Promise<ExchangeRuleVO[]> {
    return api.get('/recharge/exchange-rules')
  },

  getOrderStatus(orderNo: string): Promise<OrderStatusVO> {
    return api.get(`/recharge/orders/${orderNo}`)
  },

  getProducts(): Promise<RechargeProductVO[]> {
    return api.get('/recharge/products')
  },
}

export const rechargeQueryKeys = {
  products: ['recharge', 'products'] as const,
}
