/** Keep valid choices. Text requests require an explicit current choice, never a replacement. */
export function resolveInputModel(
  type: 'TEXT' | 'IMAGE' | 'VIDEO',
  selected: string,
  models: { code: string }[],
): string {
  if (models.some((model) => model.code === selected)) return selected
  return type === 'TEXT' ? '' : (models[0]?.code ?? '')
}
