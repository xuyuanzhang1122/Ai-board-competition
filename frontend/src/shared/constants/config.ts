export const BRANDING = {
  appName: 'AI 创作工作台',
  teamName: '你的不对我的队',
  competition: '2026 山东省首届大学生 AI 大模型创新传播大赛',
  fullName: '2026 山东省首届大学生 AI 大模型创新传播大赛 · 你的不对我的队',
  disclaimer: '本版本仅供参赛展示与评审使用，非正式商业版本。',
  currency: '积分',
}

export const API_CONFIG = {
  // 开发期默认走 Vite proxy 的同源 /api(转发到冻结后端 :8080);可用 env 覆盖
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000,
}

export const ASPECT_RATIOS = [
  { label: '1:1', value: '1:1' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
  { label: '21:9', value: '21:9' },
]

export const STYLE_CODES = {
  'disney-3d': '迪士尼3D',
  cinematic: '赛璐璐',
  'korean-manga': '韩漫',
  pixar: '皮克斯',
  miyazaki: '宫崎骏',
  'japanese-anime': '日漫',
}
