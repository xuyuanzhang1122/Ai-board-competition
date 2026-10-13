import type {
  ProjectCharacterVO,
  ProjectPropVO,
  ProjectSceneVO,
  StoryboardShotVO,
} from '@/shared/types/api'

import type { AssetEditPanelData } from '../../panel-manager-store'

const VAGUE_CHARACTER_NAMES = [
  '众舍友',
  '众人',
  '路人',
  '众',
  '路人甲',
  '路人乙',
  '其他人',
  '旁人',
  '学生们',
  '同学们',
  '舍友甲',
  '舍友乙',
  '舍友丙',
  '舍友丁',
  '路人丙',
  '路人丁',
  '降人甲',
  '降人乙',
  '士兵甲',
  '士兵乙',
  '女子甲',
  '女子乙',
  '男子甲',
  '男子乙',
  '众人甲',
  '众人乙',
]

export const isVagueCharacterName = (name: string) =>
  VAGUE_CHARACTER_NAMES.some((vagueName) => name.includes(vagueName)) ||
  /[丁丙乙甲]$/.test(name) ||
  name.includes('众') ||
  name.includes('路人')

// 资产标签必须从一行的开头开始，且只读取标签所在行。
// 这里不能使用 \s*：它会吞掉换行，导致空的“道具：”把下一行分镜词误识别为道具。
const CHARACTER_LINE_PATTERN =
  /(?:^|[\n\r])[^\S\n\r]*(?:出场)?人物[^\S\n\r]*[:：][^\S\n\r]*([^\n\r(（]*)/
const SCENE_LINE_PATTERN =
  /(?:^|[\n\r])[^\S\n\r]*场景[^\S\n\r]*[:：][^\S\n\r]*([^\n\r(（]*)/
const PROP_LINE_PATTERN =
  /(?:^|[\n\r])[^\S\n\r]*道具[^\S\n\r]*[:：][^\S\n\r]*([^\n\r(（]*)/

// 兼容两种剧本标注格式："出场人物：" (旧/导入格式) 与 "人物：" (当前 AI 生成分镜使用的格式)。
export const extractCharacterNames = (scriptText: string) => {
  const match = CHARACTER_LINE_PATTERN.exec(scriptText)
  if (!match) return []

  const names = match[1]
    .split(/[,、，]/)
    .map((name) => name.trim())
    .filter((name) => name && !isVagueCharacterName(name))
  return [...new Set(names)]
}

// 场景一般以 "场景：安乐宫院落-黑夜" 形式标注，只取一个（分镜只绑定一个场景），
// 不做拆分；namesLooselyMatch 的子串匹配足以兼容尾部可能附带的时间后缀。
export const extractSceneName = (scriptText: string) => {
  const match = SCENE_LINE_PATTERN.exec(scriptText)
  const name = match?.[1]?.trim()
  return name || null
}

export const extractPropNames = (scriptText: string) => {
  const match = PROP_LINE_PATTERN.exec(scriptText)
  if (!match) return []

  const names = match[1]
    .split(/[,、，]/)
    .map((name) => name.trim())
    .filter(Boolean)
  return [...new Set(names)]
}

export const namesLooselyMatch = (left: string, right: string) =>
  left === right || left.includes(right) || right.includes(left)

export const getCharacterName = (character: ProjectCharacterVO) =>
  character.displayName || character.name || character.libraryCharacterName || '未命名角色'

export const getSceneName = (scene: ProjectSceneVO) =>
  scene.displayName || scene.librarySceneName || '未命名场景'

export const getPropName = (prop: ProjectPropVO) =>
  prop.displayName || prop.name || '未命名道具'

export const findCharacterByName = (characters: ProjectCharacterVO[], name: string) =>
  characters.find((character) => getCharacterName(character) === name) ??
  characters.find((character) => namesLooselyMatch(getCharacterName(character), name))

export const findSceneByName = (scenes: ProjectSceneVO[], name: string) =>
  scenes.find((scene) => getSceneName(scene) === name) ??
  scenes.find((scene) => namesLooselyMatch(getSceneName(scene), name))

export const findPropByName = (props: ProjectPropVO[], name: string) =>
  props.find((prop) => getPropName(prop) === name) ??
  props.find((prop) => namesLooselyMatch(getPropName(prop), name))

export const limitedScript = (scriptText: string) =>
  scriptText.length > 2000 ? `${scriptText.slice(0, 2000)}...` : scriptText

// 兼容修复前由“一键识别”创建的数据：旧逻辑会把整段分镜原样写成道具描述。
// 仅在描述与当前分镜完全相同时视为空，避免误删用户自己填写的相似描述。
export const editablePropDescription = (
  description: string | null | undefined,
  shotScriptText: string,
) => {
  const normalizedDescription = description?.trim()
  if (!normalizedDescription) return ''
  return normalizedDescription === limitedScript(shotScriptText).trim() ? '' : description
}

export const buildAssetEditPanelData = ({
  assetId,
  assetType,
  description,
  name,
  scriptText,
  shotId,
  thumbnailUrl,
}: {
  assetId?: number
  assetType: 'character' | 'prop' | 'scene'
  description?: string | null
  name: string
  scriptText: string
  shotId: number
  thumbnailUrl?: string | null
}): AssetEditPanelData => {
  const normalizedScript = limitedScript(scriptText)
  return {
    assetId,
    assetType,
    characterName: assetType === 'character' ? name : undefined,
    existingDescription: description,
    existingThumbnailUrl: thumbnailUrl,
    name,
    prefillDescription: thumbnailUrl ? undefined : normalizedScript,
    propName: assetType === 'prop' ? name : undefined,
    sceneName: assetType === 'scene' ? name : undefined,
    scriptText: normalizedScript,
    shotId,
  }
}

export const selectedShotIdsInOrder = (shots: StoryboardShotVO[], selectedIds: Set<number>) =>
  shots.filter(({ id }) => selectedIds.has(id)).map(({ id }) => id)

export async function replaceSceneBinding({
  bind,
  currentBindingId,
  sceneId,
  unbind,
}: {
  bind: (sceneId: number) => Promise<void>
  currentBindingId?: number
  sceneId: number
  unbind: (bindingId: number) => Promise<void>
}) {
  if (currentBindingId !== undefined) await unbind(currentBindingId)
  await bind(sceneId)
}

