export const HIGHLIGHT_COLORS = {
  character: '#0891b2',
  fieldKey: '#64748b',
  prop: '#9333ea',
  scene: '#ea580c',
  shotLabel: '#0284c7',
  voice: '#64748b',
} as const

const LABEL_KEYS = ['画面构图', '人物动作', '对口型台词', '光影', '运镜细节']

const escapeHtml = (value: string) =>
  value.replaceAll(/["&'<>]/g, (character) => {
    const entities: Record<string, string> = {
      '"': '&quot;',
      '&': '&amp;',
      "'": '&#39;',
      '<': '&lt;',
      '>': '&gt;',
    }
    return entities[character]
  })

const escapeRegex = (value: string) => value.replaceAll(/[$()*+.?[\\\]^{|}]/g, '\\$&')

export function highlightScript(
  scriptText: string,
  characters: string[] = [],
  scenes: string[] = [],
  props: string[] = [],
) {
  if (!scriptText) return ''

  let html = escapeHtml(scriptText)
  html = html.replaceAll(
    // eslint-disable-next-line unicorn/better-regex -- the suggested literal conflicts with regexp/strict
    /\[声纹特征[:：][^\x5D]*\x5D/g,
    (match) =>
      `<span style="color:${HIGHLIGHT_COLORS.voice};font-style:italic">${match}</span>`,
  )
  html = html.replaceAll(
    // eslint-disable-next-line unicorn/better-regex -- the suggested literal conflicts with regexp/strict
    /运镜\d+\[[^\x5D]*\x5D/g,
    (match) =>
      `<span style="color:${HIGHLIGHT_COLORS.shotLabel};font-weight:500">${match}</span>`,
  )

  for (const key of LABEL_KEYS) {
    html = html.replaceAll(
      new RegExp(`${escapeRegex(key)}[:：]`, 'g'),
      (match) => `<span style="color:${HIGHLIGHT_COLORS.fieldKey}">${match}</span>`,
    )
  }

  const tokens: { color: string; name: string }[] = []
  const seen = new Set<string>()
  const addTokens = (names: string[], color: string) => {
    for (const rawName of names) {
      const name = rawName.trim()
      if (!name || seen.has(name)) continue
      seen.add(name)
      tokens.push({ color, name })
    }
  }

  addTokens(characters, HIGHLIGHT_COLORS.character)
  addTokens(scenes, HIGHLIGHT_COLORS.scene)
  addTokens(props, HIGHLIGHT_COLORS.prop)
  if (tokens.length === 0) return html

  tokens.sort((left, right) => right.name.length - left.name.length)
  const colorByName = new Map(tokens.map(({ color, name }) => [escapeHtml(name), color]))
  const tokenPattern = tokens.map(({ name }) => escapeRegex(escapeHtml(name))).join('|')

  return html.replaceAll(new RegExp(tokenPattern, 'g'), (match) => {
    const color = colorByName.get(match)
    return color ? `<span style="color:${color};font-weight:500">${match}</span>` : match
  })
}
