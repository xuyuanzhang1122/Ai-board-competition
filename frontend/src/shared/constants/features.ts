// 参赛版免费使用；钱包/充值路由也重定向首页，后端禁止创建充值订单。
// 邀请暂不开放。
// 注:库功能 = 编辑器内弹窗(见 Phase 4.5),不做独立 *-library 页,故无对应 flag/路由。
export const FEATURE_FLAGS = {
  home: true,
  creation: true,
  toolbox: true,
  wallet: false,
  recharge: false,
  invite: false,
} as const

export type FeatureKey = keyof typeof FEATURE_FLAGS
