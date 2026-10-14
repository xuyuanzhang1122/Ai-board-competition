import type { ModelVO } from '@/shared/types/api'

// Candidate identity only; availability must come from the server's enabled catalog.
const TEXT_PROVIDERS: Record<string, string> = {
  'deepseek-flash': 'deepseek',
  'deepseek-v4-pro': 'deepseek',
  'mimo-v2.6-pro': 'mimo',
}

export const normalizeTextPreference = (code: unknown): string =>
  typeof code === 'string' && Object.hasOwn(TEXT_PROVIDERS, code) ? code : ''

export const isAvailableOfficialTextModel = (model: ModelVO): boolean =>
  model.type === 'LANGUAGE' &&
  model.enabled === 1 &&
  normalizeTextPreference(model.code) !== '' &&
  TEXT_PROVIDERS[model.code] === model.provider?.trim().toLowerCase()
