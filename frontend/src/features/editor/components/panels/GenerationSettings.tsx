import { Box, ChevronDown, Settings } from 'lucide-react'
import type { ReactNode } from 'react'

/** Shared, keyboard-accessible model entry for every single-asset panel. */
export function GenerationSettings({
  children,
  pending,
  summary,
}: {
  children: ReactNode
  pending: boolean
  summary: string
}) {
  return (
    <div className="generation-settings">
      <p className="generation-summary">
        {summary}
        {pending ? ' · 待接入' : ''}
      </p>
      <details
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.currentTarget.open = false
            event.currentTarget.querySelector('summary')?.focus()
          }
        }}
      >
        <summary aria-label="模型与参数设置" title="模型与参数设置">
          <Box size={16} />
          <Settings size={16} />
          <span>模型设置</span>
          <ChevronDown size={14} />
        </summary>
        <div className="generation-settings-popover">
          <h4>模型与参数设置</h4>
          {children}
          <p>渠道：{pending ? '未接入' : '官方接口'}</p>
          <p>费用：{pending ? '待接入后确认' : '以已核验模型配置为准'}</p>
        </div>
      </details>
    </div>
  )
}
