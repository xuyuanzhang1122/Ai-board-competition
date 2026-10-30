import { describe, expect, it } from 'vitest'

import { createPanelManagerStore } from '../../panel-manager-store'
import { createPanelDrafts, createTargetLease, guardTargetDependencies,mediaUnavailableMessage, panelTargetKey  } from './panel-target'

describe('single target panel boundaries', () => {
  it('returns to the selected asset list after generation', () => {
    const store = createPanelManagerStore()
    store.getState().openPanel('default', { activeTab: 'props' })
    store.getState().openPanel('shot-image-generate', { shotId: 1, shotNo: 1 })
    store.getState().closePanel()
    expect(store.getState().panelData).toEqual({ activeTab: 'props' })
  })
  it('retains A settings across remounts without sharing with B, another project or account', () => {
    const drafts = createPanelDrafts()
    const key = panelTargetKey(1, 2, 'image', 3)
    drafts.set(key, 'model', 'one-off')
    expect(drafts.get(key, 'model', 'default')).toBe('one-off')
    for (const other of [panelTargetKey(1, 2, 'image', 4), panelTargetKey(1, 9, 'image', 3), panelTargetKey(8, 2, 'image', 3)])
      expect(drafts.get(other, 'model', 'default')).toBe('default')
  })
  it('invalidates late upload/hydration/generation on unmount and identity changes', () => {
    let current = 'account-project-A'
    const lease = createTargetLease(current, () => current)
    expect(lease.current()).toBe(true)
    current = 'account-project-B'
    expect(lease.current()).toBe(false)
    current = 'account-project-A'
    lease.dispose()
    expect(lease.current()).toBe(false)
  })
  it('explains missing media capability', () => {
    expect(mediaUnavailableMessage(false, [])).toContain('暂不可用')
    expect(mediaUnavailableMessage(true, [])).toContain('加载')
    expect(mediaUnavailableMessage(false, [{ code: 'ok' }])).toBeNull()
  })
})

it('stops an upload pipeline before its second mutation after switching targets', async () => {
  let finish!: (url: string) => void
  let active = true
  const mutations: string[] = []
  const guarded = guardTargetDependencies({
    upload: () => new Promise<string>((resolve) => { finish = resolve }),
    apply: (url: string) => { mutations.push(url) },
  }, () => active)
  const operation = (async () => { const url = await guarded.upload(); guarded.apply(url) })()
  active = false
  finish('https://test/A.png')
  await expect(operation).rejects.toThrow('目标已切换')
  expect(mutations).toEqual([])
})

it('preserves callable API client methods while guarding their async results', async () => {
  const client = Object.assign(() => Promise.resolve('request'), { put: () => Promise.resolve('updated') })
  const guarded = guardTargetDependencies({ api: client }, () => true)
  await expect(guarded.api.put()).resolves.toBe('updated')
})
