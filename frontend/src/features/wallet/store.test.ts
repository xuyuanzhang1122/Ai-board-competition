import { beforeEach, describe, expect, it } from 'vitest'

import { useWalletUiStore } from './store'

describe('wallet UI store', () => {
  beforeEach(() => useWalletUiStore.getState().reset())

  it('switches transaction filters without losing the current page', () => {
    useWalletUiStore.getState().setCurrentPage(3)
    useWalletUiStore.getState().setFilter('CONSUME')

    expect(useWalletUiStore.getState()).toMatchObject({ currentPage: 3, filter: 'CONSUME' })
  })

  it('clamps invalid pages and resets the page state', () => {
    useWalletUiStore.getState().setCurrentPage(0)
    expect(useWalletUiStore.getState().currentPage).toBe(1)

    useWalletUiStore.getState().setCurrentPage(4)
    useWalletUiStore.getState().reset()
    expect(useWalletUiStore.getState()).toMatchObject({ currentPage: 1, filter: 'ALL' })
  })
})
