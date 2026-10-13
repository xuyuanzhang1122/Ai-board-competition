interface PlaceholderProps {
  title: string
  phase?: string
}

// Phase 0 路由占位页:后续切片会逐个替换为真实页面
export function Placeholder({ title, phase = '待迁移' }: PlaceholderProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">
        该页面为占位({phase}),将在对应迁移切片中实现。
      </p>
    </div>
  )
}
