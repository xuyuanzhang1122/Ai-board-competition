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

// 不自动选择付费文本模型；用户从服务器当前可用目录选择。
// 图片/视频默认值仍待媒体替换阶段迁移，不能据此宣称 M1 完成。
export const DEFAULT_MODEL_CONFIG: ModelConfigData = {
  characterImageModel: 'gemini-3-pro-image-preview',
  languageModel: '',
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
      return {
        ...DEFAULT_MODEL_CONFIG,
        ...parsed,
        languageModel: normalizeTextPreference(parsed.languageModel),
      }
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
    ...(initialOverrides.languageModel !== undefined
      ? {
          languageModel: normalizeTextPreference(
            initialOverrides.languageModel,
          ),
        }
      : {}),

    resetToDefault() {
      set(() => {
        saveConfig({ ...DEFAULT_MODEL_CONFIG })
        return { ...DEFAULT_MODEL_CONFIG }
      })
    },

    updateConfig(config) {
      set((state) => {
        const next = {
          ...state,
          ...config,
          languageModel: normalizeTextPreference(
            config.languageModel ?? state.languageModel,
          ),
        }
        saveConfig(toConfig(next))
        return next
      })
    },
  }))

export const useModelConfigStore = createModelConfigStore()
