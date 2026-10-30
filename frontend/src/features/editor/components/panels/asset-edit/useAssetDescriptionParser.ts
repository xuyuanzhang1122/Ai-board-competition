import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useUserStore } from '@/shared/store/user'

import { textGenerationApi } from '../../../api'
import { useEditorStore } from '../../../store'
import { guardTargetDependencies } from '../panel-target'
import { usePanelDraft, usePanelTarget } from '../usePanelTarget'
import type { EditableAssetType } from './types'

export interface DescriptionParserInput {
  assetName: string
  assetType: EditableAssetType
  draftKey?: string
  existingDescription?: string | null
  languageModel?: string
  prefillDescription?: string
  projectId: number | null
  scriptText: string
}

export interface DescriptionParserDeps {
  cacheCharacterDescription: (name: string, description: string) => void
  generateText: (
    data: { assetType: EditableAssetType; assetName: string; sourceText: string },
    projectId: number,
    options?: { model?: string },
  ) => Promise<{ text: string }>
  getCachedCharacterDescription: (name: string) => string | undefined
}

export const assetTypeLabel = (assetType: EditableAssetType): string => {
  switch (assetType) {
    case 'character': {
      return '角色'
    }
    case 'scene': {
      return '场景'
    }
    case 'prop': {
      return '道具'
    }
  }
}

export const defaultDescription = (
  assetName: string,
  assetType: EditableAssetType,
): string => {
  const name = assetName.trim()
  return name ? `${name}，一个${assetTypeLabel(assetType)}` : `${assetTypeLabel(assetType)}`
}

export const buildDescriptionRequest = (
  assetType: EditableAssetType,
  assetName: string,
  sourceText: string,
) => ({ assetType, assetName, sourceText })

export const runDescriptionParse = async (
  input: DescriptionParserInput,
  deps: DescriptionParserDeps,
  signal?: AbortSignal,
): Promise<{ description: string; parseError: boolean }> => {
  const {
    assetType,
    assetName,
    existingDescription,
    prefillDescription,
    projectId,
    scriptText,
  } = input

  if (existingDescription?.trim()) {
    return { description: existingDescription.trim(), parseError: false }
  }

  // 道具识别只确定名称。没有已有描述时保持输入框为空，不再从分镜全文自动扩写。
  if (assetType === 'prop') {
    return { description: '', parseError: false }
  }

  const sourceText = prefillDescription?.trim() || scriptText.trim()
  if (!assetName.trim() || !sourceText || !projectId) {
    return { description: defaultDescription(assetName, assetType), parseError: true }
  }

  const currentName = assetName.trim()
  const currentScriptText = sourceText

  if (assetType === 'character') {
    const cached = deps.getCachedCharacterDescription(currentName)
    if (cached) return { description: cached, parseError: false }
  }

  const prompt = buildDescriptionRequest(assetType, currentName, currentScriptText)

  // Let immediate effect cleanup cancel this dispatch before React replays setup in development.
  await Promise.resolve()
  if (signal?.aborted) {
    return { description: defaultDescription(assetName, assetType), parseError: false }
  }
  try {
    const { text } = await deps.generateText(prompt, projectId, { model: input.languageModel })
    if (signal?.aborted) {
      return { description: defaultDescription(assetName, assetType), parseError: false }
    }
    const description = text.trim()
    if (assetType === 'character') deps.cacheCharacterDescription(currentName, description)
    return { description, parseError: false }
  } catch {
    // A failed HTTP response does not prove the supplier rejected the request. Never replay automatically.
    return { description: defaultDescription(assetName, assetType), parseError: true }
  }
}

const cacheKey = (name: string) => JSON.stringify([useUserStore.getState().userId, useEditorStore.getState().projectId, name])

const createDefaultDeps = (): DescriptionParserDeps => ({
  cacheCharacterDescription: (name, description) => {
    useEditorStore.getState().cacheCharacterDescription(cacheKey(name), description)
  },
  generateText: (prompt, projectId, options) =>
    textGenerationApi.describeAsset(prompt, projectId, options),
  getCachedCharacterDescription: (name) =>
    useEditorStore.getState().characterDescriptionCache.get(cacheKey(name)),
})

export function useAssetDescriptionParser(
  input: DescriptionParserInput,
  deps?: Partial<DescriptionParserDeps>,
) {
  const target = usePanelTarget(`description-${input.assetType}`, input.assetName)
  const [aiDescription, setAiDescription] = usePanelDraft(input.draftKey ?? target.key, 'description', input.existingDescription ?? '')
  const editedRef = useRef(Boolean(aiDescription))
  const changeDescription = useCallback((value: string) => { editedRef.current = true; setAiDescription(value) }, [setAiDescription])
  const [isParsing, setIsParsing] = useState(false)
  const [parseError, setParseError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const abortRef = useRef<AbortController | null>(null)

  const resolvedDeps = useMemo<DescriptionParserDeps>(
    () => guardTargetDependencies({ ...createDefaultDeps(), ...deps }, target.current),
    [deps, target],
  )

  useEffect(() => {
    let active = true
    const abortController = new AbortController()
    abortRef.current?.abort()
    abortRef.current = abortController

    setIsParsing(true)
    setParseError(false)

    if (editedRef.current) { setIsParsing(false); return () => abortController.abort() }
    runDescriptionParse(input, resolvedDeps, abortController.signal)
      .then(({ description, parseError: nextParseError }) => {
        if (!active || !target.current() || editedRef.current) return
        setAiDescription(description)
        setParseError(nextParseError)
      })
      .finally(() => {
        if (active) setIsParsing(false)
      })

    return () => {
      active = false
      abortController.abort()
    }
  }, [
    input.assetType,
    input.assetName,
    input.existingDescription,
    input.languageModel,
    input.prefillDescription,
    input.projectId,
    input.scriptText,
    retryKey,
    resolvedDeps,
    target,
    setAiDescription,
  ])

  const retry = useCallback(() => { editedRef.current = false; setRetryKey((key) => key + 1) }, [])

  return { aiDescription, isParsing, parseError, retry, setAiDescription: changeDescription }
}
