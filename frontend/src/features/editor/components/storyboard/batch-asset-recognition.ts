import type {
  ProjectCharacterVO,
  ProjectPropVO,
  ProjectSceneVO,
  StoryboardShotVO,
} from '@/shared/types/api'

import { characterApi, propApi, sceneApi, shotApi } from '../../api'
import {
  extractCharacterNames,
  extractPropNames,
  extractSceneName,
  findCharacterByName,
  findPropByName,
  findSceneByName,
  limitedScript,
  namesLooselyMatch,
} from './asset-binding-utils'

export type RecognitionAssetType = 'character' | 'scene' | 'prop'

// 一列「一键识别」：遍历所有分镜，从各自脚本提取该类资产名，已存在同名的直接绑定，
// 不存在的按面板同一契约(先建 library 再建 project 资产，描述取该分镜脚本)静默新建后绑定。
// 返回新绑定的数量，供调用方决定成功提示还是「未检测到未被识别的资产」。
export interface RecognitionContext {
  characters: ProjectCharacterVO[]
  projectId: number
  props: ProjectPropVO[]
  scenes: ProjectSceneVO[]
  shots: StoryboardShotVO[]
}

export interface RecognitionDeps {
  characterApi: Pick<typeof characterApi, 'createCharacter' | 'createLibraryCharacter'>
  propApi: Pick<typeof propApi, 'addPropToProject' | 'createLibraryProp'>
  sceneApi: Pick<typeof sceneApi, 'createLibraryScene' | 'createScene'>
  shotApi: Pick<typeof shotApi, 'createBinding'>
}

const defaultDeps: RecognitionDeps = { characterApi, propApi, sceneApi, shotApi }

// 同一次运行内跨分镜复用已新建的资产：exact key 命中已建 map，否则回退到 loose 匹配。
const resolveCreatedId = (created: Map<string, number>, name: string) => {
  const exact = created.get(name)
  if (exact !== undefined) return exact
  for (const [createdName, id] of created) {
    if (namesLooselyMatch(createdName, name)) return id
  }
  return undefined
}

export async function recognizeAssetsForColumn(
  assetType: RecognitionAssetType,
  ctx: RecognitionContext,
  deps: RecognitionDeps = defaultDeps,
): Promise<number> {
  if (assetType === 'character') return recognizeCharacters(ctx, deps)
  if (assetType === 'scene') return recognizeScenes(ctx, deps)
  return recognizeProps(ctx, deps)
}

async function recognizeCharacters(ctx: RecognitionContext, deps: RecognitionDeps): Promise<number> {
  const created = new Map<string, number>()
  let bound = 0
  for (const shot of ctx.shots) {
    const boundNames = shot.characters.map(({ characterName }) => characterName)
    const names = extractCharacterNames(shot.scriptText).filter(
      (name) => !boundNames.some((boundName) => namesLooselyMatch(boundName, name)),
    )
    if (names.length === 0) continue
    const description = limitedScript(shot.scriptText)
    for (const name of names) {
      let id = resolveCreatedId(created, name) ?? findCharacterByName(ctx.characters, name)?.id
      if (id === undefined) {
        const library = await deps.characterApi.createLibraryCharacter({ description, name })
        const project = await deps.characterApi.createCharacter(ctx.projectId, {
          characterLibraryId: library.id,
          description,
          name,
        })
        id = project.id
        created.set(name, id)
      }
      await deps.shotApi.createBinding(ctx.projectId, shot.id, 'PCHAR', id)
      bound += 1
    }
  }
  return bound
}

async function recognizeScenes(ctx: RecognitionContext, deps: RecognitionDeps): Promise<number> {
  const created = new Map<string, number>()
  let bound = 0
  for (const shot of ctx.shots) {
    if (shot.scene) continue
    const name = extractSceneName(shot.scriptText)
    if (!name) continue
    const description = limitedScript(shot.scriptText)
    let id = resolveCreatedId(created, name) ?? findSceneByName(ctx.scenes, name)?.id
    if (id === undefined) {
      const library = await deps.sceneApi.createLibraryScene({ description, name })
      const project = await deps.sceneApi.createScene(ctx.projectId, {
        description,
        name,
        sceneLibraryId: library.id,
      })
      id = project.id
      created.set(name, id)
    }
    await deps.shotApi.createBinding(ctx.projectId, shot.id, 'PSCENE', id)
    bound += 1
  }
  return bound
}

async function recognizeProps(ctx: RecognitionContext, deps: RecognitionDeps): Promise<number> {
  const created = new Map<string, number>()
  let bound = 0
  for (const shot of ctx.shots) {
    const boundNames = shot.props.map(({ propName }) => propName)
    const names = extractPropNames(shot.scriptText).filter(
      (name) => !boundNames.some((boundName) => namesLooselyMatch(boundName, name)),
    )
    if (names.length === 0) continue
    for (const name of names) {
      let id = resolveCreatedId(created, name) ?? findPropByName(ctx.props, name)?.id
      if (id === undefined) {
        // 分镜里的道具标签只负责识别名称，不能把整段分镜当成道具描述。
        // 描述留空供用户填写；留空生成时由后端直接使用道具名称作为 prompt。
        const library = await deps.propApi.createLibraryProp({ description: '', name })
        const project = await deps.propApi.addPropToProject(ctx.projectId, {
          displayName: name,
          libraryPropId: library.id,
          overrideDescription: '',
        })
        id = project.id
        created.set(name, id)
      }
      await deps.shotApi.createBinding(ctx.projectId, shot.id, 'PPROP', id)
      bound += 1
    }
  }
  return bound
}
