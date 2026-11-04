import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { GenerationSettings } from './GenerationSettings'

describe('single asset model settings', () => {
  it('keeps an accessible settings entry and pending capability visible without inventing models', () => {
    const html = renderToStaticMarkup(
      <GenerationSettings pending summary="尚无可用模型">
        <label>
          模型
          <select disabled>
            <option>待接入</option>
          </select>
        </label>
      </GenerationSettings>,
    )
    expect(html).toContain('模型与参数设置')
    expect(html).toContain('待接入')
    expect(html).toContain('尚无可用模型')
    expect(html).toContain('<details')
    expect(html).toContain('渠道')
    expect(html).toContain('未接入')
  })
})
