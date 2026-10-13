import { ConfigProvider, ThemeProvider } from '@lobehub/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App as AntdApp } from 'antd'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider motion={motion}>
      <ThemeProvider themeMode="light">
        <QueryClientProvider client={queryClient}>
          <AntdApp>{children}</AntdApp>
        </QueryClientProvider>
      </ThemeProvider>
    </ConfigProvider>
  )
}
