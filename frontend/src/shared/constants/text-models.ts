import type { ModelVO } from '@/shared/types/api'

// Availability comes from the current upstream catalog, not a model-id whitelist.
export const normalizeTextPreference = (code: unknown): string =>
  typeof code === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/.test(code) ? code : ''

export const isAvailableOfficialTextModel = (model: ModelVO): boolean =>
  model.type === 'LANGUAGE' && model.enabled === 1 &&
  normalizeTextPreference(model.code) !== '' &&
  ['deepseek', 'mimo'].includes(model.provider?.trim().toLowerCase() ?? '')
