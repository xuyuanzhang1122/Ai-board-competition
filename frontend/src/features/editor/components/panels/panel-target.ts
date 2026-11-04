export const panelTargetKey = (userId: number | null, projectId: number | null, kind: string, target: number | string) =>
  JSON.stringify([userId, projectId, kind, target])

export function createPanelDrafts() {
  const values = new Map<string, Map<string, unknown>>()
  return {
    has(key: string, field: string) { return values.get(key)?.has(field) ?? false },
    get<T>(key: string, field: string, fallback: T): T {
      return values.get(key)?.has(field) ? values.get(key)!.get(field) as T : fallback
    },
    set(key: string, field: string, value: unknown) {
      if (!values.has(key)) values.set(key, new Map())
      values.get(key)!.set(field, value)
    },
  }
}


export function createTargetLease(expected: string, readCurrent: () => string) {
  let active = true
  return { activate: () => { active = true }, current: () => active && expected === readCurrent(), dispose: () => { active = false } }
}

export const mediaUnavailableMessage = (loading: boolean, models: readonly { code: string }[]) =>
  loading ? '正在加载媒体能力…' : models.length === 0 ? '图片/视频生成暂不可用 · 待接入，请等待参赛媒体能力开放。' : null

/** Check each async boundary before a follow-up mutation, refresh or local-history write. */
export function guardTargetDependencies<T extends object>(dependencies: T, current: () => boolean): T {
  const wrap = (object: object, quiet = false): object => new Proxy(object, {
    get(target, property) {
      const value = Reflect.get(target, property)
      if (typeof value === 'function') return new Proxy(value, {
        apply(callable, thisArg, args) {
          if (!current()) {
            if (quiet) return
            throw new Error('目标已切换，已停止后续操作')
          }
          const result = Reflect.apply(callable, thisArg, args) as unknown
          if (result instanceof Promise) return result.then((resolved: unknown) => {
            if (!current()) throw new Error('目标已切换，已停止后续操作')
            return resolved
          })
          return result
        },
        get(callable, key) {
          return Reflect.get(wrap(callable, quiet), key)
        },
      })
      return value && typeof value === 'object' ? wrap(value, quiet || property === 'notifier') : value
    },
  })
  return wrap(dependencies) as T
}
