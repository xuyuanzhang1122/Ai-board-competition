import type { Brief } from '../creation/types'

export interface Direction {
  angle: string
  beats: string[]
  callToAction: string
  emotion: string
  id: string
  keyMessage: string
  reviewNotes: string[]
  sourceIds: string[]
  title: string
}
export interface Outline {
  directions: Direction[]
  selectedId: string | null
  selectionReason: string
}
export interface Step {
  createdAt: string
  id: number
  inputSummary: string
  result: unknown
  status: string
  tool: string
}
export interface Run {
  applied?: boolean
  error: string | null
  id: number
  inputRevision: number
  model: string
  output: Outline | null
  promptVersion: number
  status: string
  steps: Step[]
}
export interface Brainstorm {
  brief: Brief
  confirmed: boolean
  creationDraftId: number | null
  id: number
  outline: Outline | null
  revision: number
  runs: Run[]
}
export type Pending =
  | { kind: 'create'; payload: { requestId: string; brief: Brief } }
  | { kind: 'save'; id: number; payload: { revision: number; brief: Brief; outline: Outline | null } }
  | { kind: 'run'; id: number; payload: { requestId: string; revision: number; model: string } }
  | { kind: 'adopt'; id: number; runId: number; payload: { revision: number } }
  | { kind: 'confirm'; id: number; payload: { revision: number } }
  | { kind: 'handoff'; id: number; payload: { revision: number; requestId: string } }
