// 功能可见性开关。对齐旧项目:钱包/充值/邀请暂时屏蔽(仅隐藏导航入口,路由仍保留)。
// 将来要恢复某功能,把对应值改为 true 即可。
// 注:库功能 = 编辑器内弹窗(见 Phase 4.5),不做独立 *-library 页,故无对应 flag/路由。
export const FEATURE_FLAGS = {
  home: true,
  toolbox: true,
  wallet: false,
  recharge: false,
  invite: false,
} as const

export type FeatureKey = keyof typeof FEATURE_FLAGS
