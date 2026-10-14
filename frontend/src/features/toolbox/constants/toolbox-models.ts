// AI 工具箱模型 capability 映射
// 模型清单改由后端 /api/ai-models 动态下发；本文件只保留按 code 查找的
// 比例、时长、计费等能力属性与全 type 默认值。

export interface ModelCapability {
  description?: string
  name?: string
}

export interface TextCapability extends ModelCapability {
  costPerToken: number
}

export interface SelectOption {
  label: string
  value: string
}

export interface ImageCapability extends ModelCapability {
  /** 展示用尺寸标签(方图·2880x2880等)，按aspectRatios的字面值查找；未配置时直接显示字面值。 */
  aspectRatioLabels?: Record<string, string>
  aspectRatios: string[]
  /** 该模型支持的背景选项；未配置时不展示背景选择器。 */
  backgrounds?: SelectOption[]
  costPerItem: number
  /** 单次最多生成张数；未配置或为1时不展示张数选择器。 */
  maxCount?: number
  /** 该模型支持的输出格式；未配置时不展示输出格式选择器。 */
  outputFormats?: string[]
  /** 该模型支持的质量档位；未配置时不展示质量选择器。 */
  qualities?: SelectOption[]
}

export interface VideoCapability extends ModelCapability {
  aspectRatios: string[]
  costPerSecond: number
  durations: number[]
  resolutions: string[]
}

export const DEFAULT_TEXT_CAPABILITY: TextCapability = {
  costPerToken: 0,
  description: '文本生成',
}

export const DEFAULT_IMAGE_CAPABILITY: ImageCapability = {
  aspectRatios: ['1:1'],
  costPerItem: 0,
  description: '图片生成',
}

export const DEFAULT_VIDEO_CAPABILITY: VideoCapability = {
  aspectRatios: ['16:9'],
  costPerSecond: 0,
  description: '视频生成',
  durations: [5],
  resolutions: ['854x480'],
}

export const TEXT_CAPABILITY_BY_CODE: Record<string, TextCapability> = {
  'deepseek-flash': { costPerToken: 0, description: 'DeepSeek 文本生成', name: 'DeepSeek Flash' },
  'deepseek-v4-pro': { costPerToken: 0, description: 'DeepSeek 文本生成', name: 'DeepSeek V4 Pro' },
  'mimo-v2.6-pro': { costPerToken: 0, description: 'MiMo 文本生成', name: 'MiMo V2.6 Pro' },
}

export const IMAGE_CAPABILITY_BY_CODE: Record<string, ImageCapability> = {
  'gemini-3-pro-image-preview': {
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'],
    costPerItem: 20,
    description: '顶级质量图片',
    name: 'Gemini 3 Pro Image',
  },
  'gemini-3.1-flash-image-preview': {
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'],
    costPerItem: 20,
    description: '快速高质量图片',
    name: 'Gemini 3.1 Flash Image',
  },
  'gemini-2.5-flash-image-preview': {
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'],
    costPerItem: 0,
    description: 'Gemini 快速图片生成',
    name: 'Gemini 2.5 Flash Image',
  },
  'gpt-image-2': {
    aspectRatios: ['1:1', '4:3', '3:2', '2:3', '16:9', '9:16'],
    costPerItem: 15,
    description: 'OpenAI 图像生成',
    name: 'GPT Image 2',
  },
  'gpt-image-2-pro': {
    aspectRatios: ['1:1', '4:3', '3:2', '2:3', '16:9', '9:16'],
    costPerItem: 0,
    description: 'OpenAI 高分辨率图片生成',
    name: 'GPT Image 2 Pro',
  },
  'gpt-image-2-vip': {
    aspectRatios: ['1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16', '21:9'],
    costPerItem: 0,
    description: 'OpenAI VIP 图片生成',
    name: 'GPT Image 2 VIP',
  },
  'doubao-seedream-4-0-250828': {
    aspectRatios: ['1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16', '21:9'],
    costPerItem: 0,
    description: '豆包即梦图片生成',
    name: '豆包即梦 Seedream 4.0',
  },
  'doubao-seedream-4-5-251128': {
    aspectRatios: ['1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16', '21:9'],
    costPerItem: 0,
    description: '豆包即梦高质量图片生成',
    name: '豆包即梦 Seedream 4.5',
  },
  'doubao-seedream-5-0-260128': {
    aspectRatios: ['1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16', '21:9'],
    costPerItem: 0,
    description: '豆包即梦新一代图片生成',
    name: '豆包即梦 Seedream 5.0',
  },
  'grok-4-2-image': {
    aspectRatios: ['1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16', '21:9'],
    costPerItem: 0,
    description: 'Grok 图片生成',
    name: 'Grok 4.2 Image',
  },
  'gpt-image-2-4k': {
    aspectRatios: [
      '2880x2880',
      '3220x2575',
      '2160x3840',
      '3840x1646',
      '3840x2160',
      '3325x2494',
      '3526x2352',
      '2575x3220',
      '2494x3325',
      '2352x3526',
    ],
    aspectRatioLabels: {
      '2160x3840': '竖屏 · 2160x3840',
      '2352x3526': '长图 · 2352x3526',
      '2494x3325': '竖版 · 2494x3325',
      '2575x3220': '海报 · 2575x3220',
      '2880x2880': '方图 · 2880x2880',
      '3220x2575': '横屏 · 3220x2575',
      '3325x2494': '横幅 · 3325x2494',
      '3526x2352': '标准 · 3526x2352',
      '3840x1646': '超宽 · 3840x1646',
      '3840x2160': '宽屏 · 3840x2160',
    },
    // 透明背景在该渠道的gpt-image-2上游实测不支持，因此不提供该选项。
    backgrounds: [
      { label: '自动', value: 'auto' },
      { label: '不透明', value: 'opaque' },
    ],
    costPerItem: 0,
    description: 'sub2api渠道 GPT Image 2 4K，支持1-4张/质量/输出格式/背景',
    maxCount: 4,
    name: 'GPT Image 2 4K',
    outputFormats: ['png', 'jpeg', 'webp'],
    qualities: [
      { label: '自动', value: 'auto' },
      { label: '低质量', value: 'low' },
      { label: '标准', value: 'standard' },
      { label: '高质量', value: 'high' },
    ],
  },
}

// 视频模型来自 sudashuiapi Seedance 2.0 接口。分辨率由模型名决定(720p/1080p)，
// 画幅比例通过 metadata.payload.aspectRatio 传递；resolutions 按模型分辨率档
// 换算出各画幅比例对应的像素尺寸，供前端"画面尺寸"选择器展示。
const RESOLUTIONS_720P = ['1280x720', '720x1280', '720x720', '960x720', '720x960', '1680x720']
const RESOLUTIONS_1080P = ['1920x1080', '1080x1920', '1080x1080', '1440x1080', '1080x1440', '2520x1080']
const SEEDANCE_ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9']

export const VIDEO_CAPABILITY_BY_CODE: Record<string, VideoCapability> = {
  'sd-api-2-fast-720p': {
    aspectRatios: SEEDANCE_ASPECT_RATIOS,
    costPerSecond: 5,
    description: 'Seedance 2.0 Fast 720p（绕过人脸限制，可用于真人素材）',
    durations: [5, 10, 15],
    name: 'Seedance 2.0 Fast 720p（绕过人脸限制）',
    resolutions: RESOLUTIONS_720P,
  },
  'sd-api-2-720p': {
    aspectRatios: SEEDANCE_ASPECT_RATIOS,
    costPerSecond: 5,
    description: 'Seedance 2.0 720p（绕过人脸限制，可用于真人素材）',
    durations: [5, 10, 15],
    name: 'Seedance 2.0 720p（绕过人脸限制）',
    resolutions: RESOLUTIONS_720P,
  },
  'sd-api-2-1080p': {
    aspectRatios: SEEDANCE_ASPECT_RATIOS,
    costPerSecond: 5,
    description: 'Seedance 2.0 1080p（绕过人脸限制，可用于真人素材）',
    durations: [5, 10, 15],
    name: 'Seedance 2.0 1080p（绕过人脸限制）',
    resolutions: RESOLUTIONS_1080P,
  },
  'sd-2-fast-720p': {
    aspectRatios: SEEDANCE_ASPECT_RATIOS,
    costPerSecond: 5,
    description: 'Seedance 2.0 Fast 720p',
    durations: [5, 10, 15],
    name: 'Seedance 2.0 Fast 720p',
    resolutions: RESOLUTIONS_720P,
  },
  'sd-2-720p': {
    aspectRatios: SEEDANCE_ASPECT_RATIOS,
    costPerSecond: 5,
    description: 'Seedance 2.0 720p',
    durations: [5, 10, 15],
    name: 'Seedance 2.0 720p',
    resolutions: RESOLUTIONS_720P,
  },
  'sd-2-1080p': {
    aspectRatios: SEEDANCE_ASPECT_RATIOS,
    costPerSecond: 5,
    description: 'Seedance 2.0 1080p',
    durations: [5, 10, 15],
    name: 'Seedance 2.0 1080p',
    resolutions: RESOLUTIONS_1080P,
  },
}

function getCapability(
  type: 'TEXT' | 'IMAGE' | 'VIDEO',
  modelCode: string,
): TextCapability | ImageCapability | VideoCapability {
  if (type === 'TEXT') return TEXT_CAPABILITY_BY_CODE[modelCode] || DEFAULT_TEXT_CAPABILITY
  if (type === 'IMAGE') return IMAGE_CAPABILITY_BY_CODE[modelCode] || DEFAULT_IMAGE_CAPABILITY
  return VIDEO_CAPABILITY_BY_CODE[modelCode] || DEFAULT_VIDEO_CAPABILITY
}

/**
 * 根据类型和模型计算预估消耗
 */
// 用户积分费用固定为零；供应商人民币成本不在浏览器中估算。
export function calculateEstimatedCost(
  _type: 'TEXT' | 'IMAGE' | 'VIDEO',
  _modelCode: string,
  _options?: { promptLength?: number; duration?: number },
): number {
  return 0
}

/**
 * 获取类型的默认比例
 */
export function getDefaultAspectRatio(type: 'TEXT' | 'IMAGE' | 'VIDEO'): string {
  if (type === 'TEXT') return ''
  const capability = getCapability(type, '') as ImageCapability | VideoCapability
  return capability.aspectRatios[0] || ''
}

/**
 * 获取模型支持的比例列表
 */
export function getModelAspectRatios(
  type: 'TEXT' | 'IMAGE' | 'VIDEO',
  modelCode: string,
): string[] {
  if (type === 'TEXT') return []
  const capability = getCapability(type, modelCode) as ImageCapability | VideoCapability
  return capability.aspectRatios
}

/**
 * 获取视频模型支持的时长列表
 */
export function getVideoDurations(modelCode: string): number[] {
  const capability = getCapability('VIDEO', modelCode) as VideoCapability
  return capability.durations
}

/** 获取视频模型支持的分辨率列表。 */
export function getVideoResolutions(modelCode: string): string[] {
  const capability = getCapability('VIDEO', modelCode) as VideoCapability
  return capability.resolutions
}

/** 获取某个画幅比例/尺寸取值的展示标签；未配置标签时回退为字面值本身。 */
export function getAspectRatioLabel(modelCode: string, ratio: string): string {
  const capability = getCapability('IMAGE', modelCode) as ImageCapability
  return capability.aspectRatioLabels?.[ratio] || ratio
}

/** 获取图片模型单次最多生成张数；未配置时默认1(不展示张数选择器)。 */
export function getImageMaxCount(modelCode: string): number {
  const capability = getCapability('IMAGE', modelCode) as ImageCapability
  return capability.maxCount || 1
}

/** 获取图片模型支持的质量档位；未配置时返回空数组(不展示质量选择器)。 */
export function getImageQualities(modelCode: string): SelectOption[] {
  const capability = getCapability('IMAGE', modelCode) as ImageCapability
  return capability.qualities || []
}

/** 获取图片模型支持的输出格式；未配置时返回空数组(不展示输出格式选择器)。 */
export function getImageOutputFormats(modelCode: string): string[] {
  const capability = getCapability('IMAGE', modelCode) as ImageCapability
  return capability.outputFormats || []
}

/** 获取图片模型支持的背景选项；未配置时返回空数组(不展示背景选择器)。 */
export function getImageBackgrounds(modelCode: string): SelectOption[] {
  const capability = getCapability('IMAGE', modelCode) as ImageCapability
  return capability.backgrounds || []
}
