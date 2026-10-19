import { create, type StoreApi, type UseBoundStore } from 'zustand'

import { normalizeTextPreference } from '@/shared/constants/text-models'

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

const STORAGE_KEY = 'competition_model_config_v1'

// 文本需从当前可用目录主动选择；图片/视频尚未完成接入核验，不能恢复旧偏好。
export const DEFAULT_MODEL_CONFIG: ModelConfigData = {
  characterImageModel: '',
  languageModel: '',
  sceneImageModel: '',
  shotImageModel: '',
  videoModel: '',
}

const normalizeConfig = (config: Partial<ModelConfigData>): ModelConfigData => ({
  ...DEFAULT_MODEL_CONFIG,
  languageModel: normalizeTextPreference(config.languageModel),
})

const loadConfig = (): ModelConfigData => {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_MODEL_CONFIG }
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<ModelConfigData>
      return normalizeConfig(parsed)
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
    ...normalizeConfig({ ...loadConfig(), ...initialOverrides }),

    resetToDefault() {
      set(() => {
        saveConfig({ ...DEFAULT_MODEL_CONFIG })
        return { ...DEFAULT_MODEL_CONFIG }
      })
    },

    updateConfig(config) {
      set((state) => {
        const next = normalizeConfig({ ...state, ...config })
        saveConfig(next)
        return next
      })
    },
  }))

export const useModelConfigStore = createModelConfigStore()
