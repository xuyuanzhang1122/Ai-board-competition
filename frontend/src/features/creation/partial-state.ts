import type { Board } from './types'

export function partialTargets(board: Board | null, selected: string[], locked: string[]): string[] {
  return board?.shots.filter(shot => selected.includes(shot.id) && !locked.includes(shot.id)).map(shot => shot.id) ?? []
}
