import { useState } from 'react'

import { partialTargets } from './partial-state'
import type { Board } from './types'

export function PartialRegeneration({ board, disabled, lockedShotIds, onGenerate, onLock }: {
  board: Board
  disabled: boolean
  lockedShotIds: string[]
  onGenerate: (shotIds: string[], instruction: string) => void
  onLock: (shotIds: string[]) => void
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [instruction, setInstruction] = useState('')
  const targets = partialTargets(board, selected, lockedShotIds)
  return <fieldset className="creation-subcard creation-stack" disabled={disabled}>
    <legend>局部重生成与镜头锁定</legend>
    <p className="creation-hint">只生成所选未锁定镜头的候选，人工采用后写回。保留其他镜头、资产、ID、序号和时长。锁定会保存并更新版本，旧候选随即失效。</p>
    {board.shots.map(shot => <div className="creation-grid" key={shot.id}>
      <label><input aria-label={`选择重生成镜头 ${shot.no}`} checked={targets.includes(shot.id)} disabled={lockedShotIds.includes(shot.id)} type="checkbox" onChange={event => setSelected(event.target.checked ? [...selected, shot.id] : selected.filter(id => id !== shot.id))} /> 镜头 {shot.no} · {shot.id}</label>
      <label><input aria-label={`锁定镜头 ${shot.no}`} checked={lockedShotIds.includes(shot.id)} type="checkbox" onChange={event => onLock(event.target.checked ? [...lockedShotIds, shot.id] : lockedShotIds.filter(id => id !== shot.id))} /> 锁定镜头 {shot.no}</label>
    </div>)}
    <label className="creation-field"><span>局部修改要求</span><textarea maxLength={2000} rows={3} value={instruction} onChange={event => setInstruction(event.target.value)} /></label>
    <p className="creation-hint">本次选择 {targets.length} 镜；锁定 {lockedShotIds.length} 镜。请先保存当前编辑再操作。</p>
    <button disabled={targets.length === 0 || !instruction.trim()} type="button" onClick={() => onGenerate([...targets], instruction.trim())}>仅重生成所选镜头</button>
  </fieldset>
}
