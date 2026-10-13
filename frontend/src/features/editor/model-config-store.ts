import { create, type StoreApi, type UseBoundStore } from 'zustand'

export interface ModelConfigData {
  characterImageModel: string
  languageModel: string
  sceneImageModel: string
  shotImageModel: string
  videoModel: string
}

export interface ModelConfigActions {
  resetToDefault: () => void
  updateConfig: (config: Partial<ModelConfigData>) => void
}

export type ModelConfigStore = ModelConfigData & ModelConfigActions
export type ModelConfigStoreHook = UseBoundStore<StoreApi<ModelConfigStore>>

const STORAGE_KEY = 'yuanmeng_model_config'

// 默认模型须取当前启用模型(对齐后端 application.yml 与 V22/V23/V31 白名单)。
// 图片模型与后端 GeekNow 媒体模型白名单一致；视频模型走 sudashuiapi Seedance 2.0。
export const DEFAULT_MODEL_CONFIG: ModelConfigData = {
  characterImageModel: 'gemini-3-pro-image-preview',
  languageModel: 'gemini-3.5-flash',
  sceneImageModel: 'gemini-3-pro-image-preview',
  shotImageModel: 'gemini-3-pro-image-preview',
  videoModel: 'sd-api-2-fast-720p',
}

const toConfig = (state: ModelConfigStore): ModelConfigData => ({
  characterImageModel: state.characterImageModel,
  languageModel: state.languageModel,
  sceneImageModel: state.sceneImageModel,
  shotImageModel: state.shotImageModel,
  videoModel: state.videoModel,
})

const loadConfig = (): ModelConfigData => {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_MODEL_CONFIG }
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<ModelConfigData>
      return { ...DEFAULT_MODEL_CONFIG, ...parsed }
    }
  } catch {
    // Ignore malformed local storage and fall back to defaults.
  }
  return { ...DEFAULT_MODEL_CONFIG }
}

const saveConfig = (config: ModelConfigData) => {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    // Ignore unavailable or exhausted local storage.
  }
}

export const createModelConfigStore = (
  initialOverrides: Partial<ModelConfigData> = {},
): ModelConfigStoreHook =>
  create<ModelConfigStore>((set) => ({
    ...loadConfig(),
    ...initialOverrides,

    resetToDefault() {
      set(() => {
        saveConfig({ ...DEFAULT_MODEL_CONFIG })
        return { ...DEFAULT_MODEL_CONFIG }
      })
    },

    updateConfig(config) {
      set((state) => {
        const next = { ...state, ...config }
        saveConfig(toConfig(next))
        return next
      })
    },
  }))

export const useModelConfigStore = createModelConfigStore()
