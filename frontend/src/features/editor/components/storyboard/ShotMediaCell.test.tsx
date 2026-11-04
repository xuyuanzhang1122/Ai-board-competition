import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { AssetStatusVO } from '@/shared/types/api'
import { ShotMediaCell } from './ShotMediaCell'

const captured = vi.hoisted(() => ({
  open: undefined as (() => void) | undefined,
}))
vi.mock('@lobehub/ui', () => ({ ActionIcon: () => null, Modal: () => null }))
vi.mock('./AssetCell', () => ({
  AssetCell: (props: { onPreview: () => void }) => {
    captured.open = props.onPreview
    return null
  },
}))

describe('ready shot media region', () => {
  it.each(['shot-image', 'video'] as const)(
    'opens the right panel for %s, leaving preview as a separate action',
    (mediaType) => {
      const open = vi.fn()
      const asset: AssetStatusVO = {
        assetId: 1,
        currentVersionId: 1,
        currentUrl: '/uploads/existing.png',
        status: 'READY',
        totalVersions: 1,
      }
      renderToStaticMarkup(
        <ShotMediaCell
          asset={asset}
          label="媒体"
          mediaType={mediaType}
          onGenerate={open}
          onDelete={vi.fn()}
          onOpenVersions={vi.fn()}
        />,
      )
      captured.open?.()
      expect(open).toHaveBeenCalledOnce()
    },
  )
})
