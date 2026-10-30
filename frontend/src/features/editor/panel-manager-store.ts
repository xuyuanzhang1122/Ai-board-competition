import { create, type StoreApi, type UseBoundStore } from 'zustand'

export interface DefaultPanelData {
  activeTab?: 'characters' | 'scenes' | 'props'
}

export interface AssetEditPanelData {
  assetId?: number
  assetType: 'character' | 'scene' | 'prop' | 'shot' | 'video'
  characterName?: string
  existingDescription?: string | null
  existingThumbnailUrl?: string | null
  name?: string
  prefillDescription?: string
  propName?: string
  sceneName?: string
  scriptText?: string
  shotId?: number
}

export type HistoryPanelData = Record<string, never>

export interface ShotGenerationPanelData {
  shotId: number
  shotNo: number
}

export interface PanelDataByType {
  'asset-edit': AssetEditPanelData
  'default': DefaultPanelData
  'history': HistoryPanelData
  'shot-image-generate': ShotGenerationPanelData
  'video-generate': ShotGenerationPanelData
}

export type ActivePanelType = keyof PanelDataByType
export type PanelType = ActivePanelType | null
export type PanelData = PanelDataByType[ActivePanelType]
type PanelTypeWithOptionalData = 'default' | 'history'
type PanelTypeWithRequiredData = Exclude<ActivePanelType, PanelTypeWithOptionalData>

type PanelDataPatch = Partial<
  DefaultPanelData & AssetEditPanelData & ShotGenerationPanelData
>

export interface OpenPanel {
  <T extends PanelTypeWithOptionalData>(type: T, data?: PanelDataByType[T]): void
  <T extends PanelTypeWithRequiredData>(type: T, data: PanelDataByType[T]): void
  (type: null): void
}

export interface PanelManagerStore {
  closePanel: () => void
  currentPanelType: PanelType
  defaultPanelData: DefaultPanelData
  openPanel: OpenPanel
  panelData: PanelData
  panelKey: number
  updatePanelData: (data: PanelDataPatch) => void
}

export type PanelManagerStoreHook = UseBoundStore<StoreApi<PanelManagerStore>>

export const createPanelManagerStore = (): PanelManagerStoreHook =>
  create<PanelManagerStore>((set, get) => {
    const openPanel = ((type: PanelType, data?: PanelData) => {
      set((state) => ({
        currentPanelType: type,
        panelData: type === 'default' ? data ?? state.defaultPanelData : data ?? {},
        defaultPanelData: type === 'default' ? (data as DefaultPanelData | undefined) ?? state.defaultPanelData : state.defaultPanelData,
        panelKey: state.currentPanelType === type ? state.panelKey + 1 : state.panelKey,
      }))
    }) as OpenPanel

    return {
      defaultPanelData: {},
      closePanel() {
        set((state) => ({
          currentPanelType: 'default',
          panelData: state.defaultPanelData,
          panelKey: state.panelKey + 1,
        }))
      },
      currentPanelType: 'default',
      openPanel,
      panelData: {},
      panelKey: 0,
      updatePanelData(data) {
        const panelData = { ...get().panelData, ...data } as PanelData
        set({ panelData, ...(get().currentPanelType === 'default' ? { defaultPanelData: panelData as DefaultPanelData } : {}) })
      },
    }
  })

export const usePanelManagerStore = createPanelManagerStore()
