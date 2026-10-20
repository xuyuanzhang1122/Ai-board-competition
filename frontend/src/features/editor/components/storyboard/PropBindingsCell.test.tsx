import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { BoundPropVO, StoryboardShotVO } from '@/shared/types/api'

import { PropBindingList } from './PropBindingList'
import { PropBindingsCell } from './PropBindingsCell'
import type { ShotAssetBindings } from './useShotAssetBindings'

// Lobe's emoji dependency cannot be loaded by Node SSR; keep our own bindings real.
vi.mock('@lobehub/ui', () => {
  const Button = ({
    icon: _icon,
    ...rest
  }: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: unknown }) => <button {...rest} />
  return {
    Button,
    ActionIcon: Button,
    Tag: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  }
})

const props = (count: number): BoundPropVO[] =>
  Array.from({ length: count }, (_, index) => ({
    bindingId: index + 100,
    propId: index + 1,
    propName: `道具${index + 1}`,
    thumbnailUrl: null,
  }))

describe('shot prop bindings', () => {
  it.each([1, 3, 10])('makes all %i bound props available', (count) => {
    const html = renderToStaticMarkup(
      <PropBindingList props={props(count)} onOpen={vi.fn()} onRemove={vi.fn()} />,
    )
    expect(html.match(/aria-label="查看道具/g)).toHaveLength(count)
    expect(html.match(/aria-label="移除道具/g)).toHaveLength(count)
    expect(html).toContain(`查看道具${count}`)
  })

  it.each([0, 1, 3, 10])(
    'exposes the total of %i props and an add action in the collapsed cell',
    (count) => {
      const shot = { props: props(count) } as StoryboardShotVO
      const bindings = { props: [] } as unknown as ShotAssetBindings
      const html = renderToStaticMarkup(<PropBindingsCell bindings={bindings} shot={shot} />)
      expect(html).toContain('添加道具')
      if (count) {
        expect(html).toContain(`查看全部道具，共 ${count} 项`)
        expect(html).toContain('aria-expanded="false"')
      } else {
        expect(html).not.toContain('查看全部道具')
      }
    },
  )
})
