import type { Direction, Outline } from './types'

export function OutlineEditor({ outline, onChange }: { outline: Outline; onChange: (value: Outline) => void }) {
  const change = (index: number, patch: Partial<Direction>) => onChange({ ...outline, directions: outline.directions.map((item, position) => position === index ? { ...item, ...patch } : item) })
  return (
    <div className="creation-stack">
      <div className="brainstorm-directions">
        {outline.directions.map((direction, index) => (
          <article className={`brainstorm-direction ${outline.selectedId === direction.id ? 'brainstorm-selected' : ''}`} key={direction.id}>
            <label className="brainstorm-select">
              <input checked={outline.selectedId === direction.id} name="selected-direction" type="radio" value={direction.id} onChange={() => onChange({ ...outline, selectedId: direction.id })} />
              <strong>选择方向 {index + 1}</strong>
            </label>
            {([['title', '标题'], ['angle', '切入点'], ['keyMessage', '核心信息'], ['emotion', '预期情绪'], ['callToAction', '行动引导']] as const).map(([field, label]) => (
              <label className="creation-field" key={field}><span>{label}</span><input maxLength={field === 'title' ? 128 : field === 'emotion' || field === 'callToAction' ? 500 : 1000} value={direction[field]} onChange={(event) => change(index, { [field]: event.target.value })} /></label>
            ))}
            <label className="creation-field"><span>故事节点 · 每行一项</span><textarea rows={5} value={direction.beats.join('\n')} onChange={(event) => change(index, { beats: event.target.value.split('\n') })} /></label>
            <label className="creation-field"><span>引用来源 ID · 逗号分隔</span><input value={direction.sourceIds.join(', ')} onChange={(event) => change(index, { sourceIds: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} /></label>
            <label className="creation-field"><span>待核实项 · 每行一项</span><textarea rows={3} value={direction.reviewNotes.join('\n')} onChange={(event) => change(index, { reviewNotes: event.target.value.split('\n').filter(Boolean) })} /></label>
          </article>
        ))}
      </div>
      <label className="creation-field"><span>采用与放弃理由</span><textarea maxLength={1000} rows={3} value={outline.selectionReason ?? ''} onChange={(event) => onChange({ ...outline, selectionReason: event.target.value })} /></label>
    </div>
  )
}
