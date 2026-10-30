import { UploadCloud } from 'lucide-react'
import type React from 'react'
import { useRef, useState } from 'react'

import api from '@/shared/api/client'
import { uploadApi } from '@/shared/api/upload'

import { characterApi, propApi, sceneApi, shotApi } from '../../../api'
import { useEditorStore } from '../../../store'
import { guardTargetDependencies } from '../panel-target'
import { usePanelTarget } from '../usePanelTarget'
import type { AssetLocalUploadInput, LocalUploadDeps } from './asset-local-upload'
import { runLocalImageUpload } from './asset-local-upload'
import { defaultNotifier } from './notifier'
import type { EditableAssetType } from './types'

export interface AssetLocalTabProps extends AssetLocalUploadInput {
  assetType: EditableAssetType
}

export function AssetLocalTab(props: AssetLocalTabProps) {
  const { projectId } = props
  const target = usePanelTarget(`upload-${props.assetType}`, props.assetId ?? props.assetName ?? 'new')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !projectId) return
    event.target.value = ''

    setIsUploading(true)
    try {
      await runLocalImageUpload(props, file, guardTargetDependencies(createLocalUploadDeps(), target.current))
    } catch {
      // The upload pipeline reports current-target errors; stale operations stop quietly.
    } finally {
      if (target.current()) setIsUploading(false)
    }
  }

  return (
    <div className="mb-6">
      <input
        accept="image/*"
        className="hidden"
        ref={fileInputRef}
        type="file"
        onChange={(event) => void handleFileChange(event)}
      />
      <button
        className="flex h-40 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400 transition-colors hover:border-slate-300 hover:bg-slate-100 disabled:opacity-60"
        disabled={isUploading || !projectId}
        type="button"
        onClick={() => fileInputRef.current?.click()}
      >
        {isUploading ? (
          <>
            <span className="inline-block size-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
            <span className="mt-3 text-sm font-medium">上传中…</span>
          </>
        ) : (
          <>
            <UploadCloud className="size-12" />
            <span className="mt-3 text-sm font-medium">上传本地图片</span>
            <span className="text-xs">支持 JPG、PNG 格式</span>
          </>
        )}
      </button>
    </div>
  )
}

const createLocalUploadDeps = (): LocalUploadDeps => ({
  addLocalImageHistory: (...args) => useEditorStore.getState().addLocalImageHistory(...args),
  api,
  characterApi,
  fetchCharacters: () => useEditorStore.getState().fetchCharacters(),
  fetchProps: () => useEditorStore.getState().fetchProps(),
  fetchScenes: () => useEditorStore.getState().fetchScenes(),
  fetchShots: () => useEditorStore.getState().fetchShots(),
  getLocalImageHistory: (...args) => useEditorStore.getState().getLocalImageHistory(...args),
  notifier: defaultNotifier,
  propApi,
  sceneApi,
  shotApi,
  uploadApi,
})
