export interface Source {
  id: string
  license: string
  title: string
  url: string
}
export interface Brief {
  aspectRatio: string
  audience: string
  channel: string
  duration: number
  goal: string
  materials: string
  sources: Source[]
  theme: string
}
export interface Asset {
  description: string
  id: string
  name: string
  type: string
}
export interface Shot {
  cameraMovement: string
  characters: string[]
  dialogue: string
  duration: number
  id: string
  imagePrompt: string
  narration: string
  no: number
  props: string[]
  scene: string
  shotSize: string
  sourceIds: string[]
  videoPrompt: string
  visual: string
}
export interface Board {
  assets: Asset[]
  reviewNotes: string[]
  shots: Shot[]
  title: string
  version: number
}
export interface Body {
  boardConfirmed: boolean
  boardScriptVersion: number
  brief: Brief
  script: string
  scriptConfirmed: boolean
  scriptVersion: number
  storyboard: Board | null
}
export type Stage = 'SCRIPT' | 'STORYBOARD'
export type RunStage = Stage | 'STORYBOARD_PARTIAL'
export interface Run {
  applied: boolean
  error: string | null
  id: number
  inputRevision: number
  jobId: number
  model: string
  output: string | null
  promptVersion: number
  stage: RunStage
  status: string
}
export interface Draft {
  body: Body
  id: number
  lockedShotIds?: string[]
  projectId: number | null
  revision: number
  runs: Run[]
  title: string
}
export interface SaveRequest {
  brief: Brief
  revision: number
  script: string
  storyboard: Board | null
}
export interface GenerateRequest {
  model: string
  requestId: string
  revision: number
  stage: Stage
}
export interface PartialGenerateRequest {
  instruction: string
  lockedShotIds: string[]
  model: string
  requestId: string
  revision: number
  shotIds: string[]
}
export type PendingRequest =
  | { kind: 'partial'; draftId: number; payload: PartialGenerateRequest }
  | { kind: 'shot-locks'; draftId: number; payload: { revision: number; lockedShotIds: string[] } }
  | RevisionRequest
  | { kind: 'create'; payload: { requestId: string; brief: Brief } }
  | { kind: 'generate'; draftId: number; payload: GenerateRequest }
  | { kind: 'project'; draftId: number; payload: { requestId: string; revision: number } }

export type RevisionRequest =
  | { kind: 'save'; draftId: number; payload: SaveRequest }
  | { kind: 'adopt'; draftId: number; runId: number; payload: { revision: number } }
  | { kind: 'confirm'; draftId: number; payload: { revision: number; stage: Stage } }
