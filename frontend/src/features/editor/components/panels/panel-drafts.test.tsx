import type { Dispatch, SetStateAction } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'

import { useModelConfigStore } from '../../model-config-store'
import { panelTargetKey } from './panel-target'
import { usePanelDraft } from './usePanelTarget'

it('restores one-off model and reference settings across target remounts without changing project defaults', () => {
  const defaultModel = useModelConfigStore.getState().shotImageModel
  let changeModel!: Dispatch<SetStateAction<string>>
  let changeReference!: Dispatch<SetStateAction<string | null>>
  function Probe({ target }: { target: string }) {
    const [model, setModel] = usePanelDraft(target, 'model', defaultModel)
    const [reference, setReference] = usePanelDraft<string | null>(target, 'reference', null)
    changeModel = setModel
    changeReference = setReference
    return <span>{model}|{reference}</span>
  }
  const a = panelTargetKey(1, 10, 'image', 11)
  renderToStaticMarkup(<Probe target={a} />)
  changeModel('one-off')
  changeReference('https://test/reference.png')
  for (const key of [panelTargetKey(1, 10, 'image', 12), panelTargetKey(2, 10, 'image', 11), panelTargetKey(1, 20, 'image', 11)]) {
    const html = renderToStaticMarkup(<Probe target={key} />)
    expect(html).not.toContain('one-off')
    expect(html).not.toContain('reference.png')
  }
  const restored = renderToStaticMarkup(<Probe target={a} />)
  expect(restored).toContain('one-off|https://test/reference.png')
  expect(useModelConfigStore.getState().shotImageModel).toBe(defaultModel)
})
