import { useEffect, useRef, useState } from 'react'
import { useBlocker, useNavigate } from 'react-router-dom'

import { modelApi } from '@/features/editor/model-api'
import { isAccountSessionCurrent } from '@/shared/api/client'
import type { ModelVO } from '@/shared/types/api'

import { DEFAULT_BRIEF } from '../creation/defaults'
import type { Brief } from '../creation/types'
import { forSession } from './api'
import { mergeRemote, recoverRequest } from './state'
import type { Brainstorm, Outline, Pending } from './types'

interface Workspace {
  brief: Brief
  busy: boolean
  dirty: boolean
  draft: Brainstorm | null
  drafts: Brainstorm[]
  error: string
  loading: boolean
  model: string
  models: ModelVO[]
  outline: Outline | null
  pending: Pending | null
  revision: number
  storageError: string
}
interface Recovery {
  edit: { brief: Brief; outline: Outline | null; revision: number } | null
  pending: Pending | null
}
const errorMessage = (error: unknown) => error instanceof Error ? error.message : '操作失败，请查看记录'
const definitiveRejection = (error: unknown) => {
  const value = error as { name?: string; code?: number } | null
  return value?.name === 'ApiBusinessError' && typeof value.code === 'number'
    && ((value.code >= 400 && value.code < 500) || (value.code >= 40000 && value.code < 50000))
}

export function useBrainstorm(userId: number, token: string, route: string) {
  const api = useRef(forSession({ userId, token })).current
  const navigate = useNavigate()
  const [state, setState] = useState<Workspace>(() => ({
    draft: null, drafts: [], brief: structuredClone(DEFAULT_BRIEF), outline: null, revision: 0,
    dirty: false, pending: null, busy: false, loading: true, error: '', storageError: '', model: '', models: [],
  }))
  const snapshot = useRef(state)
  const alive = useRef(true)
  const readable = useRef(true)
  const epochRef = useRef(0)
  const pathname = useRef(window.location.pathname).current
  const key = `brainstorm-recovery:v1:${userId}:${route}`
  const current = () => alive.current && window.location.pathname === pathname && isAccountSessionCurrent({ userId, token })
  const patch = (change: Partial<Workspace>) => {
    snapshot.current = { ...snapshot.current, ...change }
    setState(snapshot.current)
  }
  const persist = (value: Workspace) => {
    const recovery: Recovery = { pending: value.pending, edit: value.dirty ? { brief: value.brief, outline: value.outline, revision: value.revision } : null }
    if (recovery.pending || recovery.edit) localStorage.setItem(key, JSON.stringify(recovery))
    else localStorage.removeItem(key)
  }
  const apply = (draft: Brainstorm) => patch({ draft, brief: draft.brief, outline: draft.outline, revision: draft.revision, dirty: false,
    drafts: [draft, ...snapshot.current.drafts.filter((item) => item.id !== draft.id)],
  })
  const protectedWork = () => snapshot.current.dirty || !!snapshot.current.pending || snapshot.current.busy
  const blocker = useBlocker(({ currentLocation, nextLocation }) => currentLocation.pathname !== nextLocation.pathname && protectedWork())
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm('有未保存编辑或待确认请求，已保留本机恢复副本。确定离开吗？')) blocker.proceed()
    else blocker.reset()
  }, [blocker])
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (protectedWork()) { event.preventDefault(); event.returnValue = '' }
    }
    const accountLeave = (event: Event) => {
      if (protectedWork() && !window.confirm('有未保存编辑或待确认请求。确定退出并保留当前账号恢复副本吗？')) event.preventDefault()
    }
    window.addEventListener('beforeunload', beforeUnload)
    window.addEventListener('creation:before-account-leave', accountLeave)
    return () => { window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('creation:before-account-leave', accountLeave) }
  }, [])
  useEffect(() => {
    alive.current = true
    const epoch = ++epochRef.current
    const acceptLoad = () => epoch === epochRef.current && current()
    let recovered: Recovery | null = null
    try {
      const raw = localStorage.getItem(key)
      recovered = raw ? JSON.parse(raw) as Recovery : null
      if (recovered) patch({ pending: recovered.pending, ...(recovered.edit ? { ...recovered.edit, dirty: true } : {}) })
    } catch {
      readable.current = false
      patch({ storageError: '恢复副本无法读取，已阻止发送以免重复受理。请复制内容并修复本机存储后重新加载。' })
    }
    void Promise.allSettled([api.list(), modelApi.getModels('LANGUAGE'), route === 'new' ? Promise.resolve(null) : api.detail(Number(route))]).then(([list, models, detail]) => {
      if (!acceptLoad()) return
      if (list.status === 'fulfilled') patch({ drafts: list.value })
      if (models.status === 'fulfilled') patch({ models: models.value, model: models.value[0]?.code ?? '' })
      if (detail.status === 'fulfilled' && detail.value) {
        if (recovered?.edit) patch({ draft: detail.value })
        else apply(detail.value)
      }
      patch({ loading: false, error: [list, models, detail].some((item) => item.status === 'rejected') ? '部分数据未加载，请重新加载；恢复副本保留。' : recovered?.edit ? '已恢复未保存编辑，请核对版本后保存。' : '' })
    })
    const interval = window.setInterval(() => {
      if (route === 'new' || !acceptLoad() || snapshot.current.busy) return
      void api.detail(Number(route)).then((draft) => {
        if (acceptLoad() && !snapshot.current.busy) patch(mergeRemote(snapshot.current, draft))
      }).catch(() => { /* Read-only polling never resubmits model work. */ })
    }, 3000)
    return () => { alive.current = false; ++epochRef.current; window.clearInterval(interval) }
  }, [userId, token, route])

  function edit(brief: Brief, outline: Outline | null) {
    if (snapshot.current.busy || snapshot.current.pending) return
    const next = { ...snapshot.current, brief, outline, dirty: true }
    try { persist(next); next.storageError = '' } catch { next.storageError = '本机恢复副本保存失败，离开前请复制内容。' }
    patch(next)
  }
  async function send(next: Pending) {
    if (!current() || !readable.current || snapshot.current.busy) return
    const request = recoverRequest(snapshot.current.pending, next)
    try { persist({ ...snapshot.current, pending: request }) }
    catch { patch({ storageError: '无法保存原请求，请释放本机存储后重试；请求尚未发送。' }); return }
    patch({ pending: request, busy: true, error: '', storageError: '' })
    try {
      let destination: string | null = null
      if (request.kind === 'create') {
        const draft = await api.create(request.payload)
        if (!current()) return
        apply(draft); destination = `/brainstorm/${draft.id}`
      } else if (request.kind === 'run') {
        const run = await api.run(request.id, request.payload)
        if (!current()) return
        const draft = snapshot.current.draft
        if (draft) patch({ draft: { ...draft, runs: [run, ...draft.runs.filter((item) => item.id !== run.id)] } })
      } else if (request.kind === 'handoff') {
        const result = await api.handoff(request.id, request.payload)
        if (!current()) return
        destination = `/creation/${result.draftId}`
        if (snapshot.current.draft) patch({ draft: { ...snapshot.current.draft, creationDraftId: result.draftId } })
      } else {
        const draft = request.kind === 'save' ? await api.save(request.id, request.payload)
          : request.kind === 'adopt' ? await api.adopt(request.id, request.runId, request.payload.revision)
            : await api.confirm(request.id, request.payload.revision)
        if (!current()) return
        apply(draft)
      }
      patch({ pending: null, busy: false })
      try { persist(snapshot.current) } catch { patch({ storageError: '服务端已完成，本机请求副本清理失败；重试原请求可核对结果。' }) }
      if (destination) navigate(destination)
    } catch (error) {
      if (!current()) return
      const pending = definitiveRejection(error) ? null : request
      patch({ pending, busy: false, error: `${errorMessage(error)}${pending ? '。受理状态待确认，请仅重试原请求。' : ''}` })
      try { persist(snapshot.current) } catch { patch({ storageError: '本机恢复副本更新失败，请保留原请求。' }) }
    }
  }
  async function discard() {
    if (!current() || snapshot.current.pending || snapshot.current.busy) return
    if (!window.confirm('放弃本机未保存编辑并读取服务端版本？')) return
    patch({ busy: true })
    try {
      if (snapshot.current.draft) {
        const draft = await api.detail(snapshot.current.draft.id)
        if (!current()) return
        apply(draft)
      } else patch({ brief: structuredClone(DEFAULT_BRIEF), outline: null, revision: 0, dirty: false })
      patch({ busy: false, error: '' }); persist(snapshot.current)
    } catch (error) { if (current()) patch({ busy: false, error: errorMessage(error) }) }
  }
  async function download() {
    const draft = snapshot.current.draft
    if (!draft || !current()) return
    try {
      const evidence = await api.export(draft.id)
      if (!current()) return
      const url = URL.createObjectURL(new Blob([JSON.stringify(evidence, null, 2)], { type: 'application/json' }))
      const link = document.createElement('a'); link.href = url; link.download = `头脑风暴-${draft.id}-过程记录.json`; link.click(); URL.revokeObjectURL(url)
    } catch (error) { if (current()) patch({ error: errorMessage(error) }) }
  }
  return { ...state, edit, send, discard, download, setModel: (model: string) => patch({ model }), setError: (error: string) => patch({ error }), api }
}
