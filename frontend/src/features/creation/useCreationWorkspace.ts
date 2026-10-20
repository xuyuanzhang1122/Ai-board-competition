import { useEffect, useRef, useState } from 'react'
import { useBlocker, useNavigate } from 'react-router-dom'

import { modelApi } from '@/features/editor/model-api'
import { useUserStore } from '@/shared/store/user'
import type { ModelVO } from '@/shared/types/api'

import { creationApi } from './api'
import { DEFAULT_BRIEF } from './defaults'
import { readRecovery, type Recovery, writeRecovery } from './persistence'
import { acceptResponse, createEpochGate, mergePoll, prepareRequest, settleRequest } from './state'
import type { Body, Draft, PendingRequest } from './types'

const initialBody = (): Body => ({
  brief: structuredClone(DEFAULT_BRIEF),
  script: '',
  scriptVersion: 0,
  scriptConfirmed: false,
  storyboard: null,
  boardScriptVersion: 0,
  boardConfirmed: false,
})
const message = (error: unknown) =>
  error instanceof Error ? error.message : '操作失败，请查看运行记录并重试'
interface Workspace {
  boardJson: string
  body: Body
  busy: boolean
  dirty: boolean
  draft: Draft | null
  drafts: Draft[]
  editRevision: number
  error: string
  loading: boolean
  model: string
  models: ModelVO[]
  pending: PendingRequest | null
  storageError: string
}

/** Mounted once per account/token/route. All async responses must pass this session's gate. */
export function useCreationWorkspace(account: number, token: string, route: string) {
  const navigate = useNavigate()
  const [state, setState] = useState<Workspace>(() => ({
    draft: null,
    body: initialBody(),
    boardJson: '',
    dirty: false,
    editRevision: 0,
    pending: null,
    busy: false,
    loading: true,
    error: '',
    storageError: '',
    drafts: [],
    models: [],
    model: '',
  }))
  const snapshot = useRef(state)
  const alive = useRef(true)
  const gate = useRef(createEpochGate())
  const recoveryReadable = useRef(true)
  const accountLeaveConfirmed = useRef(false)
  const pathname = useRef(window.location.pathname).current
  const session = `${account}:${token}:${route}`
  const isCurrent = () =>
    acceptResponse(
      session,
      alive.current && window.location.pathname === pathname
        ? `${useUserStore.getState().userId}:${useUserStore.getState().token}:${route}`
        : 'expired',
    )
  const patch = (change: Partial<Workspace>) => {
    snapshot.current = { ...snapshot.current, ...change }
    setState(snapshot.current)
  }
  const persist = (next: Workspace) => {
    const value: Recovery = {
      pending: next.pending,
      edit: next.dirty
        ? { revision: next.editRevision, body: next.body, boardJson: next.boardJson }
        : null,
    }
    writeRecovery(localStorage, account, route, value)
  }
  const applyDraft = (draft: Draft) =>
    patch({
      draft,
      body: draft.body,
      boardJson: draft.body.storyboard ? JSON.stringify(draft.body.storyboard, null, 2) : '',
      dirty: false,
      editRevision: draft.revision,
    })
  const needsGuard = () =>
    !accountLeaveConfirmed.current &&
    (snapshot.current.dirty || !!snapshot.current.pending || snapshot.current.busy)
  const leaveMessage = () =>
    `有未保存编辑或受理状态待确认的请求。${snapshot.current.storageError ? '本机恢复副本保存失败，请先复制内容。' : '本机已保留恢复副本，返回此创作可继续。'}确定离开吗？`
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      currentLocation.pathname !== nextLocation.pathname && needsGuard(),
  )

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm(leaveMessage())) blocker.proceed()
    else blocker.reset()
  }, [blocker]) // The ref always contains the latest edit, including changes during navigation.

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (needsGuard()) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    const beforeAccountLeave = (event: Event) => {
      if (!needsGuard()) return
      if (!window.confirm(leaveMessage())) event.preventDefault()
      else accountLeaveConfirmed.current = true
    }
    window.addEventListener('beforeunload', beforeUnload)
    window.addEventListener('creation:before-account-leave', beforeAccountLeave)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      window.removeEventListener('creation:before-account-leave', beforeAccountLeave)
    }
  }, [])

  useEffect(() => {
    alive.current = true
    const epoch = gate.current.next()
    const currentLoad = () => gate.current.accepts(epoch) && isCurrent()
    let recovery: Recovery | null = null
    try {
      recovery = readRecovery(localStorage, account, route)
      if (recovery)
        patch({
          pending: recovery.pending,
          ...(recovery.edit
            ? {
                body: recovery.edit.body,
                boardJson: recovery.edit.boardJson,
                dirty: true,
                editRevision: recovery.edit.revision,
              }
            : {}),
        })
    } catch {
      recoveryReadable.current = false
      patch({
        storageError:
          '无法读取本机恢复副本；为避免覆盖未知请求，已禁止发送。请检查浏览器存储并重新加载。',
      })
    }
    void Promise.allSettled([
      creationApi.list(),
      modelApi.getModels('LANGUAGE'),
      route === 'new' ? Promise.resolve(null) : creationApi.detail(Number(route)),
    ]).then(([list, models, detail]) => {
      if (!currentLoad()) return
      if (list.status === 'fulfilled') patch({ drafts: list.value })
      if (models.status === 'fulfilled')
        patch({ models: models.value, model: models.value[0]?.code ?? '' })
      if (detail.status === 'fulfilled' && detail.value) {
        if (recovery?.edit) patch({ draft: detail.value })
        else applyDraft(detail.value)
      }
      const failures = [list, models, detail].filter((item) => item.status === 'rejected')
      patch({
        loading: false,
        error: failures.length
          ? '部分数据加载失败，请重新加载；本机编辑和原请求仍保留。'
          : recovery?.edit
            ? '已恢复本机未保存编辑，请核对服务端版本后保存。'
            : '',
      })
    })
    const timer = window.setInterval(() => {
      if (route === 'new' || !currentLoad()) return
      void creationApi
        .detail(Number(route))
        .then((remote) => {
          if (!currentLoad()) return
          const local = snapshot.current.draft
          if (local) patch({ draft: mergePoll(local, remote) })
        })
        .catch(() => {
          /* The next poll retries only the read; never re-sends a generation. */
        })
    }, 4000)
    return () => {
      alive.current = false
      gate.current.next()
      window.clearInterval(timer)
    }
  }, [account, token, route])

  function edit(body: Body, boardJson = snapshot.current.boardJson) {
    if (snapshot.current.busy || snapshot.current.pending) return
    const next = { ...snapshot.current, body, boardJson, dirty: true }
    try {
      persist(next)
      next.storageError = ''
    } catch {
      next.storageError = '本机恢复副本保存失败；离开前请复制编辑内容。'
    }
    patch(next)
  }

  async function send(next: PendingRequest) {
    if (snapshot.current.busy || !isCurrent() || !recoveryReadable.current) return
    const request = prepareRequest(snapshot.current.pending, next)
    try {
      persist({ ...snapshot.current, pending: request })
    } catch {
      patch({ storageError: '无法持久保存原请求，请释放浏览器存储后重试。请求尚未发送。' })
      return
    }
    patch({ pending: request, busy: true, error: '', storageError: '' })
    try {
      let navigateTo: string | null = null
      if (request.kind === 'create') {
        const draft = await creationApi.create(request.payload)
        if (!isCurrent()) return
        applyDraft(draft)
        navigateTo = `/creation/${draft.id}`
      } else if (request.kind === 'generate') {
        const run = await creationApi.generate(request.draftId, request.payload)
        if (!isCurrent()) return
        const draft = snapshot.current.draft
        if (draft)
          patch({
            draft: { ...draft, runs: [run, ...draft.runs.filter((entry) => entry.id !== run.id)] },
          })
      } else if (request.kind === 'project') {
        const result = await creationApi.project(request.draftId, request.payload)
        if (!isCurrent()) return
        if (snapshot.current.draft)
          patch({ draft: { ...snapshot.current.draft, projectId: result.projectId } })
        navigateTo = `/editor/${result.projectId}`
      } else {
        const draft =
          request.kind === 'save'
            ? await creationApi.save(request.draftId, request.payload)
            : request.kind === 'adopt'
              ? await creationApi.adopt(request.draftId, request.runId, request.payload.revision)
              : await creationApi.confirm(
                  request.draftId,
                  request.payload.revision,
                  request.payload.stage,
                )
        if (!isCurrent()) return
        applyDraft(draft)
      }
      patch({ pending: null, busy: false })
      try {
        persist(snapshot.current)
      } catch {
        patch({ storageError: '服务端已完成，但本机恢复记录未清除；下次原请求重试可核对结果。' })
      }
      if (navigateTo) navigate(navigateTo)
    } catch (error) {
      if (!isCurrent()) return
      const pending = settleRequest(request, error)
      patch({
        pending,
        busy: false,
        error: pending
          ? `${message(error)}。受理状态未确认，已保留原请求，请仅重试原请求以查询或继续。`
          : message(error),
      })
      try {
        persist(snapshot.current)
      } catch {
        patch({ storageError: '本机恢复记录更新失败，原请求副本仍需保留。' })
      }
    }
  }

  async function discard() {
    if (
      snapshot.current.pending ||
      snapshot.current.busy ||
      !window.confirm('放弃本机编辑并重新读取服务端版本？此操作会清除未保存的本机恢复副本。')
    )
      return
    patch({ busy: true })
    try {
      const draft = snapshot.current.draft
      const remote = draft ? await creationApi.detail(draft.id) : null
      if (!isCurrent()) return
      if (remote) applyDraft(remote)
      else patch({ body: initialBody(), boardJson: '', dirty: false, editRevision: 0 })
      patch({ error: '', storageError: '' })
      persist(snapshot.current)
    } catch (error) {
      if (isCurrent()) patch({ error: message(error) })
    } finally {
      if (isCurrent()) patch({ busy: false })
    }
  }

  async function download() {
    if (!snapshot.current.draft || snapshot.current.busy) return
    patch({ busy: true, error: '' })
    try {
      const blob = await creationApi.export(snapshot.current.draft.id)
      if (!isCurrent()) return
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `分镜-${snapshot.current.draft.id}.xlsx`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      if (isCurrent()) patch({ error: message(error) })
    } finally {
      if (isCurrent()) patch({ busy: false })
    }
  }
  return {
    ...state,
    edit,
    send,
    discard,
    download,
    setModel: (model: string) => patch({ model }),
    setError: (error: string) => patch({ error }),
  }
}
