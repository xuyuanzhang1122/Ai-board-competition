export const MAX_SHOT_SCRIPT_LENGTH = 4000

export const normalizeShotScriptDraft = (value: string) =>
  value.trim().slice(0, MAX_SHOT_SCRIPT_LENGTH)
