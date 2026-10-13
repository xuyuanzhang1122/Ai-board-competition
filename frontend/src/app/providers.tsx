import { ConfigProvider, ThemeProvider } from '@lobehub/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'

import { FeedbackHost } from '@/shared/feedback/FeedbackHost'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

// 全局 Providers:lobehub 浅白主题 + TanStack Query
// (lobehub ThemeProvider 内部已挂 antd ConfigProvider/App,供 antd message 使用)
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider motion={motion}>
      <ThemeProvider themeMode="light">
        <QueryClientProvider client={queryClient}>
          {children}
          <FeedbackHost />
        </QueryClientProvider>
      </ThemeProvider>
    </ConfigProvider>
  )
}
