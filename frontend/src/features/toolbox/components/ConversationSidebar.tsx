import { ActionIcon, Button } from '@lobehub/ui'
import { App } from 'antd'
import { Clock3, MessageSquareText, Plus, Trash2 } from 'lucide-react'

import { cn } from '@/lib/utils'

import { useToolboxStore } from '../store'

interface ConversationSidebarProps {
  onOpenHistory: () => void
}

export function ConversationSidebar({ onOpenHistory }: ConversationSidebarProps) {
  const { message, modal } = App.useApp()
  const sessions = useToolboxStore((state) => state.sessions)
  const activeSessionId = useToolboxStore((state) => state.activeSessionId)
  const createSession = useToolboxStore((state) => state.createSession)
  const switchSession = useToolboxStore((state) => state.switchSession)
  const deleteSession = useToolboxStore((state) => state.deleteSession)

  const handleCreate = async () => {
    try {
      await createSession()
    } catch (error) {
      void message.error(error instanceof Error ? error.message : '新建对话失败')
    }
  }

  const confirmDelete = (sessionId: string, title: string) => {
    modal.confirm({
      title: `删除“${title}”？`,
      content: '该对话关联的生成历史也会一并删除，删除后无法从生成历史恢复。',
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      async onOk() {
        try {
          await deleteSession(sessionId)
          void message.success('对话及关联历史已删除')
        } catch (error) {
          void message.error(error instanceof Error ? error.message : '删除失败')
          throw error
        }
      },
    })
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-background/80 p-3 max-md:w-[216px] max-sm:hidden">
      <Button
        block
        disabled={sessions.length >= 10}
        icon={Plus}
        type="primary"
        onClick={() => void handleCreate()}
      >
        新建对话
      </Button>

      <div className="mb-2 mt-5 px-2 text-xs font-medium text-muted-foreground">对话</div>
      <div className="-mr-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
        {sessions.map((session) => {
          const active = session.id === activeSessionId
          return (
            <div
              key={session.id}
              className={cn(
                'group flex w-full items-center gap-1 rounded-lg px-1.5 py-1 text-sm transition-colors',
                active
                  ? 'bg-accent font-medium text-accent-foreground'
                  : 'bg-transparent text-foreground hover:bg-accent/60',
              )}
            >
              <button
                className="flex min-w-0 flex-1 items-center gap-2 border-0 bg-transparent px-1 py-1 text-left"
                type="button"
                onClick={() => switchSession(session.id)}
              >
                <MessageSquareText className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{session.title}</span>
              </button>
              <ActionIcon
                danger
                aria-label={`删除对话：${session.title}`}
                icon={Trash2}
                size="small"
                title="删除对话及关联历史"
                className={cn(
                  'shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100',
                  active && 'opacity-60',
                )}
                onClick={(event) => {
                  event.stopPropagation()
                  confirmDelete(session.id, session.title)
                }}
              />
            </div>
          )
        })}
      </div>

      <div className="border-t border-border pt-2">
        <Button block icon={Clock3} type="text" onClick={onOpenHistory}>
          生成历史
        </Button>
      </div>
    </aside>
  )
}
