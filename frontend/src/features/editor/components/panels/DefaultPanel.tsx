import { Button, Modal, Segmented } from '@lobehub/ui'
import type { ComponentType } from 'react'
import { useMemo, useState } from 'react'

import { usePanelManagerStore } from '../../panel-manager-store'
import { useEditorStore } from '../../store'
import {
  CharacterLibraryModal,
  PropLibraryModal,
  SceneLibraryModal,
} from '../library-modal'
import { CharacterTab } from './CharacterTab'
import {
  createAssetEditPanelData,
  type DefaultPanelAssetType,
  type DefaultPanelTab,
  useDefaultPanelAssets,
} from './default-panel-assets'
import { PropTab } from './PropTab'
import { SceneTab } from './SceneTab'

export interface ControlledLibraryModalProps {
  onAdded: () => void
  onClose: () => void
  open: boolean
  projectId: number
}

export type LibraryModalComponents = Partial<
  Record<DefaultPanelAssetType, ComponentType<ControlledLibraryModalProps>>
>

export interface DefaultPanelProps {
  activeTab?: DefaultPanelTab
  libraryModalComponents?: LibraryModalComponents
}

const TAB_OPTIONS = [
  { label: '角色', value: 'characters' },
  { label: '场景', value: 'scenes' },
  { label: '道具', value: 'props' },
]

const ASSET_LABELS: Record<DefaultPanelAssetType, string> = {
  character: '角色',
  prop: '道具',
  scene: '场景',
}

const DEFAULT_LIBRARY_MODALS: Required<LibraryModalComponents> = {
  character: CharacterLibraryModal,
  prop: PropLibraryModal,
  scene: SceneLibraryModal,
}

interface LibraryModalPlaceholderProps extends ControlledLibraryModalProps {
  assetType: DefaultPanelAssetType
}

function LibraryModalPlaceholder({
  assetType,
  onClose,
  open,
}: LibraryModalPlaceholderProps) {
  const label = ASSET_LABELS[assetType]
  return (
    <Modal
      centered
      footer={<Button onClick={onClose}>关闭</Button>}
      open={open}
      title={`${label}库`}
      onCancel={onClose}
    >
      <p className="py-8 text-center text-sm text-slate-500">
        {label}库将在 4.5 接入；当前入口已按受控 Modal 契约预留。
      </p>
    </Modal>
  )
}

export function DefaultPanel({
  activeTab: initialActiveTab = 'characters',
  libraryModalComponents,
}: DefaultPanelProps) {
  const characters = useEditorStore((state) => state.characters)
  const activeJobs = useEditorStore((state) => state.activeJobs)
  const originalScript = useEditorStore((state) => state.originalScript)
  const projectId = useEditorStore((state) => state.projectId)
  const props = useEditorStore((state) => state.props)
  const scenes = useEditorStore((state) => state.scenes)
  const openPanel = usePanelManagerStore((state) => state.openPanel)

  const [activeTab, setActiveTab] = useState<DefaultPanelTab>(initialActiveTab)
  const [openLibrary, setOpenLibrary] = useState<DefaultPanelAssetType | null>(null)
  const generatingAssetIds = useMemo(() => {
    const generating = {
      characters: new Set<number>(),
      props: new Set<number>(),
      scenes: new Set<number>(),
    }
    for (const job of activeJobs) {
      if (job.kind === 'character') {
        job.targetIds.forEach((id) => generating.characters.add(id))
      } else if (job.kind === 'scene') {
        job.targetIds.forEach((id) => generating.scenes.add(id))
      } else if (job.kind === 'prop') {
        job.targetIds.forEach((id) => generating.props.add(id))
      }
    }
    return generating
  }, [activeJobs])
  const assets = useDefaultPanelAssets({ characters, generatingAssetIds, props, scenes })

  const closeLibrary = () => setOpenLibrary(null)
  const openAssetEditor = (assetType: DefaultPanelAssetType) =>
    openPanel('asset-edit', { assetType })

  const commonTabProps = (tab: DefaultPanelTab) => ({
    categories: assets.categories[tab],
    onCategoryChange: (categoryId: number | null) => assets.setCategory(tab, categoryId),
    onOpenLibrary: () =>
      setOpenLibrary(tab === 'characters' ? 'character' : tab === 'scenes' ? 'scene' : 'prop'),
    onQueryChange: (query: string) => assets.setQuery(tab, query),
    query: assets.queries[tab],
    selectedCategoryId: assets.selectedCategories[tab],
  })

  const activeLibraryType = openLibrary
  const modalComponents = { ...DEFAULT_LIBRARY_MODALS, ...libraryModalComponents }
  const LibraryModal = activeLibraryType ? modalComponents[activeLibraryType] : undefined

  return (
    <div className="min-w-0 bg-white">
      <div className="border-b border-slate-200 p-3">
        <Segmented
          block
          options={TAB_OPTIONS}
          value={activeTab}
          onChange={(value) => setActiveTab(value as DefaultPanelTab)}
        />
      </div>

      {activeTab === 'characters' ? (
        <CharacterTab
          {...commonTabProps('characters')}
          assets={assets.filteredAssets.characters}
          onCreate={() => openAssetEditor('character')}
          onAssetClick={(asset) =>
            openPanel('asset-edit', createAssetEditPanelData(asset, originalScript))
          }
        />
      ) : null}
      {activeTab === 'scenes' ? (
        <SceneTab
          {...commonTabProps('scenes')}
          assets={assets.filteredAssets.scenes}
          onCreate={() => openAssetEditor('scene')}
          onAssetClick={(asset) =>
            openPanel('asset-edit', createAssetEditPanelData(asset, originalScript))
          }
        />
      ) : null}
      {activeTab === 'props' ? (
        <PropTab
          {...commonTabProps('props')}
          assets={assets.filteredAssets.props}
          onCreate={() => openAssetEditor('prop')}
          onAssetClick={(asset) =>
            openPanel('asset-edit', createAssetEditPanelData(asset, originalScript))
          }
        />
      ) : null}

      {activeLibraryType && projectId ? (
        LibraryModal ? (
          <LibraryModal
            open
            projectId={projectId}
            onAdded={closeLibrary}
            onClose={closeLibrary}
          />
        ) : (
          <LibraryModalPlaceholder
            open
            assetType={activeLibraryType}
            projectId={projectId}
            onAdded={closeLibrary}
            onClose={closeLibrary}
          />
        )
      ) : null}
    </div>
  )
}
