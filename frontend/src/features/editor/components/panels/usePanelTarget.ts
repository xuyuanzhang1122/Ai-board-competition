import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useUserStore } from '@/shared/store/user'

import { useEditorStore } from '../../store'
import { createPanelDrafts, createTargetLease, panelTargetKey } from './panel-target'

const drafts = createPanelDrafts()
export function usePanelDraft<T>(key: string, field: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => drafts.get(key, field, typeof initial === 'function' ? (initial as () => T)() : initial))
  const valueRef = useRef(value)
  const update: Dispatch<SetStateAction<T>> = useCallback((next) => {
    const resolved = typeof next === 'function' ? (next as (old: T) => T)(valueRef.current) : next
    drafts.set(key, field, resolved)
    valueRef.current = resolved
    setValue(resolved)
  }, [key, field])
  return [value, update]
}

export function usePanelTarget(kind: string, target: number | string) {
  const userId = useUserStore((state) => state.userId)
  const token = useUserStore((state) => state.token)
  const projectId = useEditorStore((state) => state.projectId)
  const key = panelTargetKey(userId, projectId, kind, target)
  const lease = useMemo(() => createTargetLease(JSON.stringify([key, token]), () =>
    JSON.stringify([panelTargetKey(useUserStore.getState().userId, useEditorStore.getState().projectId, kind, target), useUserStore.getState().token])), [key, kind, target, token])
  useEffect(() => {
    lease.activate()
    return () => lease.dispose()
  }, [lease])
  return useMemo(() => ({ key, current: lease.current }), [key, lease])
}
