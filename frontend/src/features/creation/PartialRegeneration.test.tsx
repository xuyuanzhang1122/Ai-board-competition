import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { PartialRegeneration } from './PartialRegeneration'
import type { Board } from './types'

const board = { shots: [{ id: 'a', no: 1, visual: '海岸' }, { id: 'b', no: 2, visual: '人工结尾' }] } as Board
it('shows persistent locked targets and keeps submission disabled without explicit selection', () => {
  const html=renderToStaticMarkup(<PartialRegeneration board={board} disabled={false} lockedShotIds={['b']} onGenerate={() => {}} onLock={() => {}} />)
  expect(html).toContain('锁定镜头 2')
  expect(html).toContain('仅重生成所选镜头')
  expect(html).toContain('disabled=""')
  expect(html).toContain('人工采用后写回')
})
describe('locked form', () => {
  it('disables lock and target controls while local edits or uncertain requests exist', () => {
    const html=renderToStaticMarkup(<PartialRegeneration disabled board={board} lockedShotIds={[]} onGenerate={() => {}} onLock={() => {}} />)
    expect(html).toMatch(/^<fieldset[^>]*disabled=""/)
  })
})
