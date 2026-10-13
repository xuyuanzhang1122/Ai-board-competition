import { HIGHLIGHT_COLORS } from '../../utils/script-highlight'

export type ScriptChipType = 'character' | 'prop' | 'scene'

export interface ScriptChipItem {
  color: string
  name: string
  type: ScriptChipType
}

export const buildScriptChips = (
  characters: string[] = [],
  scenes: string[] = [],
  props: string[] = [],
): ScriptChipItem[] => {
  const seen = new Set<string>()
  const result: ScriptChipItem[] = []
  const push = (name: string, type: ScriptChipType, color: string) => {
    const trimmed = name.trim()
    if (!trimmed || seen.has(trimmed)) return
    seen.add(trimmed)
    result.push({ color, name: trimmed, type })
  }
  characters.forEach((name) => push(name, 'character', HIGHLIGHT_COLORS.character))
  scenes.forEach((name) => push(name, 'scene', HIGHLIGHT_COLORS.scene))
  props.forEach((name) => push(name, 'prop', HIGHLIGHT_COLORS.prop))
  return result
}
