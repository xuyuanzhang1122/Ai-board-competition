import { useUserStore } from '@/shared/store/user'

import { chatStore } from './store'

/** Keep privacy boundaries active even while the toolbox route is unmounted. */
const accountFor = (state: ReturnType<typeof useUserStore.getState>) =>
  state.token && state.userId !== null ? String(state.userId) : null
chatStore.getState().bindAccount(accountFor(useUserStore.getState()))
useUserStore.subscribe((state) => chatStore.getState().bindAccount(accountFor(state)))
