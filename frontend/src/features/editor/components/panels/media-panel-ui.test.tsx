import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { AssetCustomTab } from './asset-edit/AssetCustomTab'
import { ShotImageGeneratePanel } from './ShotImageGeneratePanel'
import { VideoGeneratePanel } from './VideoGeneratePanel'

vi.mock('@/shared/components/ModelProviderIcon', () => ({ modelOptionLabel: () => '' }))
vi.mock('@lobehub/ui', () => ({
  Button: ({ children, disabled, onClick }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) => <button disabled={disabled} onClick={onClick}>{children}</button>,
  Select: () => null, Empty: () => null, TextArea: () => null,
}))
vi.mock('../../useAvailableModels', () => ({ useAvailableModels: () => ({ models: [], loading: false }) }))

const base = { aiDescription: '人工描述', aspectRatio: '1:1', isGenerating: false, isParsing: false, modelCode: 'unavailable', models: [], modelsLoading: false, onAiDescriptionChange: () => {}, onAspectRatioChange: () => {}, onGenerate: () => {}, onModelChange: () => {}, onReferenceImageChange: () => {}, onRetryParse: () => {}, parseError: false, projectId: 1 }

describe('unavailable single media actions', () => {
  it.each(['character', 'scene', 'prop'] as const)('disables %s generation and explains why', (assetType) => {
    const html = renderToStaticMarkup(<AssetCustomTab {...base} assetType={assetType} />)
    expect(html).toContain('暂不可用')
    expect(html).toMatch(/<button disabled="">AI 生成/)
  })
  it.each([ShotImageGeneratePanel, VideoGeneratePanel])('disables shot media generation and explains why', (Panel) => {
    const html = renderToStaticMarkup(<Panel shotId={7} shotNo={3} onClose={() => {}} />)
    expect(html).toContain('暂不可用')
    expect(html).toMatch(/<button disabled="">AI 生成/)
  })
})
