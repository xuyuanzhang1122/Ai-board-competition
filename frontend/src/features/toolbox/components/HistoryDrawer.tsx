import {
  Avatar,
  Drawer,
  Empty,
  Image,
  Input,
  List,
  Segmented,
  Tag,
  Video as VideoPlayer,
} from '@lobehub/ui'
import { App } from 'antd'
import { FileText, Image as ImageIcon, Video as VideoIcon } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { ToolboxHistoryVO } from '@/shared/types/api'

import { useToolboxStore } from '../store'

interface HistoryDrawerProps {
  onClose: () => void
  open: boolean
}

type FilterType = 'ALL' | 'IMAGE' | 'TEXT' | 'VIDEO'

const FILTER_OPTIONS = [
  { label: '全部', value: 'ALL' },
  { label: '文字', value: 'TEXT' },
  { label: '图片', value: 'IMAGE' },
  { label: '视频', value: 'VIDEO' },
]

const typeIcon = (type: string) =>
  type === 'IMAGE' ? ImageIcon : type === 'VIDEO' ? VideoIcon : FileText

function groupLabel(dateStr: string): string {
  const date = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (date.toDateString() === today.toDateString()) return '今天'
  if (date.toDateString() === yesterday.toDateString()) return '昨天'
  return date.toLocaleDateString('zh-CN', { day: '2-digit', month: '2-digit' })
}

const typeLabel = (type: string) =>
  type === 'IMAGE' ? '图片' : type === 'VIDEO' ? '视频' : '文字'

export function HistoryDrawer({ onClose, open }: HistoryDrawerProps) {
  const { message } = App.useApp()
  const history = useToolboxStore((state) => state.history)
  const loadHistoryToChat = useToolboxStore((state) => state.loadHistoryToChat)

  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<FilterType>('ALL')

  const groups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const filtered = history.filter((item) => {
      if (filterType !== 'ALL' && item.type !== filterType) return false
      if (query && !(item.prompt ?? '').toLowerCase().includes(query)) return false
      return true
    })

    const result = new Map<string, ToolboxHistoryVO[]>()
    for (const item of filtered) {
      const key = groupLabel(item.createdAt)
      const list = result.get(key)
      if (list) list.push(item)
      else result.set(key, [item])
    }
    return result
  }, [history, searchQuery, filterType])

  const handleClick = (item: ToolboxHistoryVO) => {
    loadHistoryToChat(item)
    onClose()
    message.success('历史记录已加载到对话区')
  }

  return (
    <Drawer
      open={open}
      placement="right"
      title="历史记录"
      width={384}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3">
        <Input
          allowClear
          placeholder="搜索提示词..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        <Segmented
          block
          options={FILTER_OPTIONS}
          value={filterType}
          onChange={(value) => setFilterType(value as FilterType)}
        />

        {groups.size === 0 ? (
          <Empty className="py-16" description="暂无历史记录" />
        ) : (
          <div className="flex flex-col gap-4">
            {[...groups.entries()].map(([key, items]) => (
              <div className="flex flex-col gap-1" key={key}>
                <span className="px-2 text-xs font-medium text-muted-foreground">{key}</span>
                <List
                  items={items.map((item) => {
                    const Icon = typeIcon(item.type)
                    const avatar =
                      item.resultUrl && item.type === 'IMAGE' ? (
                        <Image
                          alt="历史生成结果"
                          objectFit="cover"
                          preview={false}
                          size={44}
                          src={item.resultUrl}
                          variant="outlined"
                        />
                      ) : item.resultUrl && item.type === 'VIDEO' ? (
                        <VideoPlayer
                          muted
                          height={44}
                          preview={false}
                          src={item.resultUrl}
                          width={44}
                        />
                      ) : (
                        <Avatar
                          avatar={<Icon size={18} />}
                          background="#f2f4f7"
                          size={44}
                        />
                      )

                    return {
                      avatar,
                      date: new Date(item.createdAt).getTime(),
                      description: (
                        <span className="flex items-center gap-1.5">
                          <Tag color="blue">{typeLabel(item.type)}</Tag>
                          <span>{item.model || '默认模型'}</span>
                        </span>
                      ),
                      key: String(item.id),
                      title: item.prompt || '(无提示词)',
                    }
                  })}
                  onClick={({ key: itemKey }) => {
                    const item = items.find((candidate) => String(candidate.id) === itemKey)
                    if (item) handleClick(item)
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </Drawer>
  )
}
