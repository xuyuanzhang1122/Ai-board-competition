/** Media is unavailable; text requires an explicit choice from the current catalog. */
export function resolveInputModel(
  type: 'TEXT' | 'IMAGE' | 'VIDEO',
  selected: string,
  models: { code: string }[],
): string {
  if (type !== 'TEXT') return ''
  if (models.some((model) => model.code === selected)) return selected
  return ''
}
