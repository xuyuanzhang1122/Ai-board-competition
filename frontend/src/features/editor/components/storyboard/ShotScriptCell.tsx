import { ActionIcon } from '@lobehub/ui'
import { Copy, Pencil } from 'lucide-react'
import { useMemo, useState } from 'react'

import { notify } from '@/shared/feedback/feedback'
import type { StoryboardShotVO } from '@/shared/types/api'

import { highlightScript } from '../../utils/script-highlight'
import { ScriptExpandModal } from '../dialogs/ScriptExpandModal'
import { MAX_SHOT_SCRIPT_LENGTH, normalizeShotScriptDraft } from './shot-script-utils'

interface ShotScriptCellProps {
  onSave: (scriptText: string) => Promise<void> | void
  shot: StoryboardShotVO
}

// Fixed-height rows require the script column to stay within its box rather
// than growing, so overflow content is scrollable (not clipped) within that
// fixed height. Editing therefore happens exclusively in the shared
// ScriptExpandModal (opened by double-click or the edit button); there is no
// inline textarea.
export function ShotScriptCell({ onSave, shot }: ShotScriptCellProps) {
  const [editing, setEditing] = useState(false)
  const highlightedScript = useMemo(
    () =>
      highlightScript(
        shot.scriptText,
        shot.characters.map(({ characterName }) => characterName),
        shot.scene ? [shot.scene.sceneName] : [],
        shot.props.map(({ propName }) => propName),
      ),
    [shot.characters, shot.props, shot.scene, shot.scriptText],
  )

  const saveDraft = async (value: string) => {
    const nextValue = normalizeShotScriptDraft(value)
    if (nextValue !== shot.scriptText) await onSave(nextValue)
    setEditing(false)
  }
  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(shot.scriptText || '')
    } catch {
      notify.warning('复制失败，请手动复制剧本内容')
    }
  }

  return (
    <>
      <div className="group/script relative h-full w-full">
        <div className="absolute right-1 top-0 z-10 flex gap-1 opacity-0 transition group-hover/script:opacity-100 group-focus-within/script:opacity-100">
          <ActionIcon icon={Copy} size="small" title="复制剧本" onClick={() => void copyScript()} />
          <ActionIcon icon={Pencil} size="small" title="编辑剧本" onClick={() => setEditing(true)} />
        </div>
        <div
          className="max-h-[120px] cursor-text overflow-y-auto whitespace-pre-wrap break-words px-1 text-[13px] leading-5 text-slate-800"
          dangerouslySetInnerHTML={{ __html: highlightedScript }}
          title="双击编辑"
          onDoubleClick={() => setEditing(true)}
        />
      </div>

      {editing ? (
        <ScriptExpandModal
          open
          characters={shot.characters.map(({ characterName }) => characterName)}
          maxLength={MAX_SHOT_SCRIPT_LENGTH}
          props={shot.props.map(({ propName }) => propName)}
          scenes={shot.scene ? [shot.scene.sceneName] : []}
          scriptText={shot.scriptText}
          shotNo={shot.shotNo}
          onClose={() => setEditing(false)}
          onSave={(value) => void saveDraft(value)}
        />
      ) : null}
    </>
  )
}
