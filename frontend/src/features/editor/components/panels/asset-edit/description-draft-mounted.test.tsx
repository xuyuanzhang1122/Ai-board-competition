// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'

import { useAssetDescriptionParser } from './useAssetDescriptionParser'

vi.mock('@/shared/api/client', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

it.each(['已有资产描述', null])('preserves a deliberately cleared description after mounted A/B/A navigation (%s)', async (existingDescription) => {
  const container = document.createElement('div')
  const root = createRoot(container)
  const generateText = vi.fn(async () => ({ text: '自动解析结果' }))
  const deps = { generateText, cacheCharacterDescription: vi.fn(), getCachedCharacterDescription: () => undefined }
  let parser!: ReturnType<typeof useAssetDescriptionParser>
  function Probe({ target }: { target: string }) {
    parser = useAssetDescriptionParser({ assetType: 'character', assetName: target, existingDescription, projectId: 1, scriptText: '正文', draftKey: `${existingDescription}:${target}` }, deps)
    return <span>{parser.aiDescription}</span>
  }
  try {
    await act(async () => root.render(<Probe key="A" target="A" />))
    await act(async () => parser.setAiDescription(''))
    await act(async () => root.render(<Probe key="B" target="B" />))
    const beforeReturning = generateText.mock.calls.length
    await act(async () => root.render(<Probe key="A" target="A" />))
    expect(container.textContent).toBe('')
    expect(generateText).toHaveBeenCalledTimes(beforeReturning)
  } finally { await act(async () => root.unmount()) }
})
