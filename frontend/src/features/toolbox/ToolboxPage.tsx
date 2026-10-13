import { Empty, Tag } from '@lobehub/ui'
import { BackBottom, ChatHeader } from '@lobehub/ui/chat'
import { App } from 'antd'
import { Sparkles } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { useUserStore } from '@/shared/store/user'

import { ChatComposer } from './components/ChatComposer'
import {
  type ChatMessageAction,
  ToolboxChatList,
} from './components/ChatMessage'
import { ConversationSidebar } from './components/ConversationSidebar'
import { HistoryDrawer } from './components/HistoryDrawer'
import { type ConversationItem, useToolboxStore } from './store'

const downloadUrl = (url: string, filename: string) => {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
}

export function ToolboxPage() {
  const { message } = App.useApp()
  const conversations = useToolboxStore((state) => state.conversations)
  const sessions = useToolboxStore((state) => state.sessions)
  const activeSessionId = useToolboxStore((state) => state.activeSessionId)
  const init = useToolboxStore((state) => state.init)
  const stopJobPolling = useToolboxStore((state) => state.stopJobPolling)
  const saveToAssets = useToolboxStore((state) => state.saveToAssets)
  const avatarUrl = useUserStore((state) => state.user?.avatarUrl)
  const nickname = useUserStore((state) => state.user?.nickname)

  const [showHistory, setShowHistory] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const hasMessages = conversations.length > 0
  const lastResponseStatus = conversations.at(-1)?.aiResponse?.status
  const activeSession = sessions.find((session) => session.id === activeSessionId)

  useEffect(() => {
    void init()
    return () => stopJobPolling()
  }, [init, stopJobPolling])

  useEffect(() => {
    const element = scrollRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [conversations.length, lastResponseStatus])

  useEffect(() => {
    let previousJobId = useToolboxStore.getState().pollingJobId
    let lastConversationId = useToolboxStore.getState().pollingConversationId

    return useToolboxStore.subscribe((state) => {
      if (state.pollingConversationId) lastConversationId = state.pollingConversationId
      if (previousJobId !== null && state.pollingJobId === null) {
        const conversation = state.conversations.find((item) => item.id === lastConversationId)
        const status = conversation?.aiResponse?.status
        if (status === 'READY') {
          void message.success('生成完成')
        } else if (status === 'FAILED') {
          void message.error(`生成失败：${conversation?.aiResponse?.errorMessage || '未知错误'}`)
        }
      }
      previousJobId = state.pollingJobId
    })
  }, [message])

  const handleAction = useCallback(
    async (
      conversation: ConversationItem,
      action: ChatMessageAction,
      payload?: number | string,
    ) => {
      const response = conversation.aiResponse

      if (action === 'copy') {
        if (!response?.text) return
        try {
          await navigator.clipboard.writeText(response.text)
          void message.success('已复制到剪贴板')
        } catch {
          void message.error('复制失败')
        }
        return
      }

      if (action === 'open') {
        const target = typeof payload === 'string' ? payload : response?.resultUrl
        if (target) window.open(target, '_blank', 'noopener,noreferrer')
        return
      }

      if (action === 'download-image') {
        const urls = response?.allImageUrls?.length
          ? response.allImageUrls
          : response?.resultUrl
            ? [response.resultUrl]
            : []
        const index = typeof payload === 'number' ? payload : 0
        const url = urls[index]
        if (!url) return
        downloadUrl(url, `toolbox-image-${Date.now()}-${index + 1}`)
        void message.success(`开始下载图片 ${index + 1}`)
        return
      }

      if (action === 'download') {
        if (!response?.resultUrl) return
        downloadUrl(
          response.resultUrl,
          `toolbox-${conversation.contentType.toLowerCase()}-${Date.now()}`,
        )
        void message.success('开始下载')
        return
      }

      if (action === 'save-character' || action === 'save-scene') {
        if (!response?.historyId) {
          void message.warning('无法保存：缺少历史记录 ID')
          return
        }
        try {
          await saveToAssets(response.historyId)
          void message.success(action === 'save-character' ? '已保存到角色库' : '已保存到场景库')
        } catch (error) {
          void message.error(error instanceof Error ? error.message : '保存失败')
        }
      }
    },
    [message, saveToAssets],
  )

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden bg-background">
      <ConversationSidebar onOpenHistory={() => setShowHistory(true)} />

      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <ChatHeader
          left={
            <ChatHeader.Title
              desc={activeSession?.title || '新对话'}
              tag={<Tag color="blue">AI 创作</Tag>}
              title="工具箱"
            />
          }
        />

        {hasMessages ? (
          <>
            <div className="relative min-h-0 flex-1 pt-[52px]">
              <div className="h-full overflow-y-auto" ref={scrollRef}>
                <div className="mx-auto max-w-[900px] px-6 pb-8 pt-8 max-sm:px-3">
                  <ToolboxChatList
                    conversations={conversations}
                    user={{ avatarUrl: avatarUrl ?? undefined, nickname: nickname ?? undefined }}
                    onAction={(conversation, action, payload) =>
                      void handleAction(conversation, action, payload)
                    }
                  />
                </div>
              </div>
              <BackBottom target={scrollRef} text="回到底部" />
            </div>

            <footer className="shrink-0 border-t border-border bg-background/95 px-6 pb-3 pt-3 max-sm:px-3">
              <ChatComposer />
            </footer>
          </>
        ) : (
          <section className="flex min-h-0 flex-1 items-center justify-center px-6 pb-10 pt-[62px] max-sm:px-3">
            <div className="w-full max-w-[900px]">
              <Empty
                align="center"
                description="从文字灵感到图片生成，在同一段对话里完成"
                icon={Sparkles}
                imageSize={52}
                title="你今天在想些什么？"
                type="page"
              />
              <ChatComposer />
              <p className="mt-1 text-center text-xs text-muted-foreground">
                仅保留最近 7 天的生成记录，有效素材请及时引用或保存
              </p>
            </div>
          </section>
        )}
      </main>

      <HistoryDrawer open={showHistory} onClose={() => setShowHistory(false)} />
    </div>
  )
}
