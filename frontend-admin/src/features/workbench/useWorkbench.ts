import { useEffect, useMemo, useRef } from 'react'

import { TOKEN_KEY } from '@/shared/api/client'
import { workbenchApi } from '@/shared/api/workbench'

export function useWorkbench(token: string) {
  const mountedRef = useRef(false)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  const client = useMemo(() => workbenchApi(token), [token])
  return { client, active: () => mountedRef.current && localStorage.getItem(TOKEN_KEY) === token }
}
export const errorText = (error: unknown) => (error instanceof Error ? error.message : '操作失败')
export const canReplace = (dirty: boolean) =>
  !dirty || window.confirm('当前编辑尚未保存，是否放弃并打开所选记录？')
