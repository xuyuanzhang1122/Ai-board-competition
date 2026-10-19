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
  aspectRatios: [],
  costPerItem: 0,
  description: '图片生成',
}

export const DEFAULT_VIDEO_CAPABILITY: VideoCapability = {
  aspectRatios: [],
  costPerSecond: 0,
  description: '视频生成',
  durations: [],
  resolutions: [],
}

export const TEXT_CAPABILITY_BY_CODE: Record<string, TextCapability> = {
  'deepseek-flash': { costPerToken: 0, description: 'DeepSeek 文本生成', name: 'DeepSeek Flash' },
  'deepseek-v4-pro': { costPerToken: 0, description: 'DeepSeek 文本生成', name: 'DeepSeek V4 Pro' },
  'mimo-v2.6-pro': { costPerToken: 0, description: 'MiMo 文本生成', name: 'MiMo V2.6 Pro' },
}

// No media model is available until official capability, account and budget verification.
export const IMAGE_CAPABILITY_BY_CODE: Record<string, ImageCapability> = {}
export const VIDEO_CAPABILITY_BY_CODE: Record<string, VideoCapability> = {}

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
