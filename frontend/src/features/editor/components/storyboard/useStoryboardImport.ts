import { useCallback, useEffect, useRef, useState } from 'react'

import { importApi } from '../../api'
import {
  type AbortableParseSession,
  isImageFile,
  runAbortableParse,
  splitStoryboardFiles,
} from './storyboard-import-utils'

interface UseStoryboardImportOptions {
  fetchCharacters: () => Promise<void>
  fetchProps: () => Promise<void>
  fetchScenes: () => Promise<void>
  fetchShots: () => Promise<void>
  parseAndCreateShots: (scriptText: string, signal?: AbortSignal) => Promise<void>
  projectId: number | null
}

export function useStoryboardImport({
  fetchCharacters,
  fetchProps,
  fetchScenes,
  fetchShots,
  parseAndCreateShots,
  projectId,
}: UseStoryboardImportOptions) {
  const [importing, setImporting] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [parseSeconds, setParseSeconds] = useState(0)
  const [supplementing, setSupplementing] = useState(false)
  const mountedRef = useRef(true)
  const parseSession = useRef<AbortableParseSession | null>(null)
  const refreshAll = useCallback(
    () => Promise.all([fetchShots(), fetchCharacters(), fetchScenes(), fetchProps()]),
    [fetchCharacters, fetchProps, fetchScenes, fetchShots],
  )

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      parseSession.current?.cancel()
      parseSession.current = null
    }
  }, [])

  return {
    cancelParse() {
      parseSession.current?.cancel()
    },
    importStoryboard: async (files: File[]) => {
      if (!projectId) throw new Error('项目尚未加载')
      const { assetFiles, spreadsheet } = splitStoryboardFiles(files)
      if (!spreadsheet) throw new Error('仅支持 .xlsx 格式的分镜表格')
      setImporting(true)
      try {
        const summary = await importApi.importStoryboardExcel(projectId, spreadsheet, assetFiles)
        await refreshAll()
        return summary
      } finally {
        if (mountedRef.current) setImporting(false)
      }
    },
    importing,
    parseSeconds,
    parsing,
    parseScript: async (scriptText: string) => {
      if (parseSession.current) return 'cancelled' as const
      setParsing(true)
      setParseSeconds(0)
      const session = runAbortableParse({
        onSecond: () => {
          if (mountedRef.current) setParseSeconds((seconds) => seconds + 1)
        },
        parse: (signal) => parseAndCreateShots(scriptText, signal),
      })
      parseSession.current = session
      try {
        return await session.promise
      } finally {
        if (parseSession.current === session) parseSession.current = null
        if (mountedRef.current) setParsing(false)
      }
    },
    supplementImages: async (files: File[]) => {
      if (!projectId) throw new Error('项目尚未加载')
      const assetFiles = files.filter(isImageFile)
      if (assetFiles.length === 0) throw new Error('请选择图片文件')
      setSupplementing(true)
      try {
        const summary = await importApi.importAssetImages(projectId, assetFiles)
        await refreshAll()
        return summary
      } finally {
        if (mountedRef.current) setSupplementing(false)
      }
    },
    supplementing,
  }
}
