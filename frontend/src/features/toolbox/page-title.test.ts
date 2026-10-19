import { expect, it } from 'vitest'

import { applyToolboxTitle } from './page-title'

it('sets the competition toolbox title and restores the prior page title on cleanup', () => {
  const page = { title: '创作首页' }
  const cleanup = applyToolboxTitle(page)
  expect(page.title).toBe('创作工具箱 · 你的不对我的队')
  cleanup()
  expect(page.title).toBe('创作首页')
})
