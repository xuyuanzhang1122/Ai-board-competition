import { create } from 'zustand'

export type WalletFilter = 'ALL' | 'CONSUME' | 'RECHARGE' | 'REWARD'

interface WalletUiState {
  currentPage: number
  filter: WalletFilter
  reset: () => void
  setCurrentPage: (page: number) => void
  setFilter: (filter: WalletFilter) => void
}

const INITIAL_STATE = {
  currentPage: 1,
  filter: 'ALL' as WalletFilter,
}

export const useWalletUiStore = create<WalletUiState>((set) => ({
  ...INITIAL_STATE,
  reset: () => set(INITIAL_STATE),
  setCurrentPage: (page) => set({ currentPage: Math.max(1, page) }),
  setFilter: (filter) => set({ filter }),
}))
