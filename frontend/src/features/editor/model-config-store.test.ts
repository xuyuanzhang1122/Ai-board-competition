import { beforeEach, describe, expect, it } from 'vitest'

import {
  createModelConfigStore,
  DEFAULT_MODEL_CONFIG,
  type ModelConfigData,
} from './model-config-store'

const createStorage = () => {
  const store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    removeItem: (key: string) => {
      delete store[key]
    },
    setItem: (key: string, value: string) => {
      store[key] = value
    },
  }
}

describe('model config store', () => {
  beforeEach(() => {
    Object.assign(globalThis, { localStorage: createStorage() })
  })

  it('starts with default values', () => {
    const useStore = createModelConfigStore()
    expect(useStore.getState()).toMatchObject(DEFAULT_MODEL_CONFIG)
  })

  it('does not reuse the original project storage or silently choose a paid text model', () => {
    localStorage.setItem(
      'yuanmeng_model_config',
      JSON.stringify({ languageModel: 'gemini-3.5-flash' }),
    )
    expect(createModelConfigStore().getState().languageModel).toBe('')
    expect(localStorage.getItem('yuanmeng_model_config')).toContain(
      'gemini-3.5-flash',
    )
  })

  it('clears obsolete or malformed language preferences without changing media preferences', () => {
    localStorage.setItem(
      'competition_model_config_v1',
      JSON.stringify({
        languageModel: 'deepseek-v4-flash',
        sceneImageModel: 'scene-custom',
      }),
    )
    const state = createModelConfigStore().getState()
    expect(state.languageModel).toBe('')
    expect(state.sceneImageModel).toBe('scene-custom')
    state.updateConfig({ languageModel: 'gemini-3.5-flash' })
    expect(createModelConfigStore().getState().languageModel).toBe('')
  })

  it('partial updateConfig changes only provided fields', () => {
    const useStore = createModelConfigStore()
    useStore.getState().updateConfig({ shotImageModel: 'custom-shot' })

    const state = useStore.getState()
    expect(state.shotImageModel).toBe('custom-shot')
    expect(state.videoModel).toBe(DEFAULT_MODEL_CONFIG.videoModel)
  })

  it('persists changes to localStorage', () => {
    const useStore = createModelConfigStore()
    useStore.getState().updateConfig({ languageModel: 'mimo-v2.6-pro' })

    const raw = globalThis.localStorage?.getItem('competition_model_config_v1')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!) as ModelConfigData
    expect(parsed.languageModel).toBe('mimo-v2.6-pro')
    expect(parsed.videoModel).toBe(DEFAULT_MODEL_CONFIG.videoModel)
  })

  it('loads persisted values on creation', () => {
    globalThis.localStorage?.setItem(
      'competition_model_config_v1',
      JSON.stringify({ sceneImageModel: 'scene-custom' }),
    )

    const useStore = createModelConfigStore()
    const state = useStore.getState()
    expect(state.sceneImageModel).toBe('scene-custom')
    expect(state.languageModel).toBe(DEFAULT_MODEL_CONFIG.languageModel)
  })

  it('resetToDefault restores defaults and persists them', () => {
    const useStore = createModelConfigStore({ shotImageModel: 'changed' })
    useStore.getState().resetToDefault()

    const state = useStore.getState()
    expect(state.shotImageModel).toBe(DEFAULT_MODEL_CONFIG.shotImageModel)

    const raw = globalThis.localStorage?.getItem('competition_model_config_v1')
    expect(JSON.parse(raw!).shotImageModel).toBe(
      DEFAULT_MODEL_CONFIG.shotImageModel,
    )
  })
})
