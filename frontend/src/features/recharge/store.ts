import { create } from 'zustand'

import type { NativeOrderVO, RechargeProductVO } from '@/shared/types/api'

interface RechargeUiState {
  clearPayment: () => void
  completePayment: () => void
  currentOrder: NativeOrderVO | null
  openPayment: (order: NativeOrderVO) => void
  paymentOpen: boolean
  reset: () => void
  selectedProduct: RechargeProductVO | null
  selectProduct: (product: RechargeProductVO) => void
}

const INITIAL_STATE = {
  currentOrder: null,
  paymentOpen: false,
  selectedProduct: null,
}

export const useRechargeUiStore = create<RechargeUiState>((set) => ({
  ...INITIAL_STATE,
  clearPayment: () => set({ currentOrder: null, paymentOpen: false }),
  completePayment: () => set(INITIAL_STATE),
  openPayment: (order) => set({ currentOrder: order, paymentOpen: true }),
  reset: () => set(INITIAL_STATE),
  selectProduct: (product) => set({ selectedProduct: product }),
}))
