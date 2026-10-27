import type { StoryboardShotVO } from '@/shared/types/api'

import type { ShotVideoGenerationRequest } from '../../api'

export const VIDEO_SIZES = ['854x480', '480x854', '480x480'] as const
export type VideoSize = string
// 文档只公开 duration=5 的示例；保留常用 5/10/15 秒档，不虚构模型特有约束。
export const VIDEO_DURATIONS = [5, 10, 15] as const
export type VideoDuration = number

export const VIDEO_SCENE_ASSET_REQUIRED_MESSAGE = '缺少场景画像资产，禁止生成视频'

/** 场景画像资产为强制项，缺失时返回禁止生成的原因。 */
export function getVideoSceneAssetError(shot: StoryboardShotVO | undefined): string | null {
  return shot?.scene?.thumbnailUrl ? null : VIDEO_SCENE_ASSET_REQUIRED_MESSAGE
}

export const videoHistoryKey = (shotId: number) => `video_history_shot_${shotId}`

export function mapVideoSizeToAspectRatio(size: VideoSize): string {
  const [width, height] = size.split('x').map(Number)
  if (!width || !height) return '16:9'
  const ratio = width / height
  const presets = [
    ['21:9', 21 / 9],
    ['2:1', 2],
    ['16:9', 16 / 9],
    ['3:2', 3 / 2],
    ['4:3', 4 / 3],
    ['1:1', 1],
    ['3:4', 3 / 4],
    ['2:3', 2 / 3],
    ['9:16', 9 / 16],
    ['1:2', 1 / 2],
  ] as const
  return presets.reduce((closest, preset) =>
    Math.abs(Math.log(ratio / preset[1])) < Math.abs(Math.log(ratio / closest[1]))
      ? preset
      : closest,
  )[0]
}

/**
 * prompt 固定为分镜词；多参考图由人物资产、道具资产、场景资产和分镜图资产组成。
 * 场景画像资产为强制项，缺失时抛错禁止生成。
 */
export function buildVideoGenerationRequest(
  shot: StoryboardShotVO,
  options: {
    duration: VideoDuration
    model?: string
    size: VideoSize
  },
): ShotVideoGenerationRequest {
  if (!shot.scene?.thumbnailUrl) {
    throw new Error(VIDEO_SCENE_ASSET_REQUIRED_MESSAGE)
  }
  return {
    aspectRatio: mapVideoSizeToAspectRatio(options.size),
    characters: shot.characters
      .filter((character) => Boolean(character.thumbnailUrl))
      .map((character) => ({
        id: character.characterId,
        name: character.characterName,
        thumbnailUrl: character.thumbnailUrl as string,
      })),
    duration: options.duration,
    model: options.model || '',
    prompt: shot.scriptText,
    props: shot.props
      .filter((prop) => Boolean(prop.thumbnailUrl))
      .map((prop) => ({
        id: prop.propId,
        name: prop.propName,
        thumbnailUrl: prop.thumbnailUrl as string,
      })),
    referenceImageUrl: shot.shotImage.currentUrl || undefined,
    scene: {
      id: shot.scene.sceneId,
      name: shot.scene.sceneName,
      thumbnailUrl: shot.scene.thumbnailUrl,
    },
    size: options.size,
  }
}

export function getVideoFallbackThumbnail(shot: StoryboardShotVO | undefined): string {
  return (
    shot?.shotImage.currentUrl ||
    shot?.scene?.thumbnailUrl ||
    shot?.characters.find((item) => item.thumbnailUrl)?.thumbnailUrl ||
    shot?.props.find((item) => item.thumbnailUrl)?.thumbnailUrl ||
    ''
  )
}
