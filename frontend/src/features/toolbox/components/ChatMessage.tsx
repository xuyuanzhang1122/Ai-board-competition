import {
  ActionIconGroup,
  Image,
  PreviewGroup,
  Tag,
  Video,
} from '@lobehub/ui'
import {
  ChatActionsBar,
  type ChatActionsBarProps,
  ChatList,
  type ChatMessage as LobeChatMessage,
  LoadingDots,
} from '@lobehub/ui/chat'
import {
  Bot,
  CircleUserRound,
  Copy,
  Download,
  ImageIcon,
  Star,
} from 'lucide-react'
import type { ReactNode } from 'react'

import type { ConversationItem } from '../store'

export type ChatMessageAction =
  | 'copy'
  | 'open'
  | 'download'
  | 'download-image'
  | 'save-character'
  | 'save-scene'

interface ToolboxChatListProps {
  conversations: ConversationItem[]
  onAction: (
    conversation: ConversationItem,
    action: ChatMessageAction,
    payload?: number | string,
  ) => void
  user?: {
    avatarUrl?: string
    nickname?: string
  }
}

interface ToolboxMessageExtra {
  conversation: ConversationItem
  onAction: ToolboxChatListProps['onAction']
}

type ToolboxLobeMessage = LobeChatMessage & { extra: ToolboxMessageExtra }
type MessageRendererProps = LobeChatMessage & { editableContent: ReactNode }

const typeLabel = (type?: string) =>
  type === 'TEXT' ? '文字' : type === 'IMAGE' ? '图片' : type === 'VIDEO' ? '视频' : '未知'

function ImageMessage({ conversation, onAction }: ToolboxMessageExtra) {
  const response = conversation.aiResponse
  const images = response?.allImageUrls?.length
    ? response.allImageUrls
    : response?.resultUrl
      ? [response.resultUrl]
      : []

  return (
    <PreviewGroup>
      <div
        className={
          images.length > 1
            ? 'grid max-w-[520px] grid-cols-2 gap-2.5'
            : 'w-full max-w-[360px]'
        }
      >
        {images.map((url, index) => (
          <Image
            alt={`生成图片 ${index + 1}`}
            key={`${conversation.id}-${url}`}
            maxWidth="100%"
            src={url}
            variant="outlined"
            actions={
              <ActionIconGroup
                glass
                shadow
                items={[
                  {
                    icon: Download,
                    key: `download-${index}`,
                    label: '下载图片',
                  },
                  { icon: Star, key: 'save-character', label: '保存到角色库' },
                  { icon: ImageIcon, key: 'save-scene', label: '保存到场景库' },
                ]}
                onActionClick={({ key }) => {
                  if (key.startsWith('download-')) {
                    onAction(conversation, 'download-image', index)
                    return
                  }
                  onAction(conversation, key as ChatMessageAction)
                }}
              />
            }
          />
        ))}
      </div>
    </PreviewGroup>
  )
}

function ToolboxMessage({ editableContent, extra }: MessageRendererProps) {
  const toolboxExtra = extra as ToolboxMessageExtra | undefined
  if (!toolboxExtra) return editableContent

  const { conversation, onAction } = toolboxExtra
  const response = conversation.aiResponse

  if (conversation.role === 'user') return editableContent

  if (response?.status === 'GENERATING') {
    return (
      <div className="flex min-h-6 items-center gap-2 py-0.5 text-sm text-muted-foreground">
        <LoadingDots size={6} variant="typing" />
        <span>正在生成</span>
      </div>
    )
  }

  if (conversation.contentType === 'IMAGE' && response?.status === 'READY') {
    return <ImageMessage conversation={conversation} onAction={onAction} />
  }

  if (conversation.contentType === 'VIDEO' && response?.resultUrl) {
    return (
      <Video
        maxWidth={520}
        preload="metadata"
        src={response.resultUrl}
        variant="outlined"
      />
    )
  }

  return response?.status === 'FAILED' ? null : editableContent
}

function ToolboxMessageExtra({ extra }: LobeChatMessage) {
  const toolboxExtra = extra as ToolboxMessageExtra | undefined
  if (!toolboxExtra) return null

  const { conversation } = toolboxExtra

  if (conversation.role === 'user') {
    const input = conversation.userInput
    return (
      <div className="flex flex-wrap justify-end gap-1 pt-0.5">
        <Tag color="blue">{typeLabel(input?.type)}</Tag>
        {input?.model ? <Tag>{input.model}</Tag> : null}
        {input?.aspectRatio ? <Tag>{input.aspectRatio}</Tag> : null}
      </div>
    )
  }

  if (conversation.aiResponse?.status !== 'READY') return null

  return (
    <span className="text-xs text-muted-foreground">
      耗时 {conversation.aiResponse.generationTime || 0}s
    </span>
  )
}

function ToolboxMessageActions({ extra }: ChatActionsBarProps & LobeChatMessage) {
  const toolboxExtra = extra as ToolboxMessageExtra | undefined
  if (!toolboxExtra) return null

  const { conversation, onAction } = toolboxExtra
  const response = conversation.aiResponse

  if (conversation.role === 'user' || response?.status !== 'READY') return null

  const items =
    conversation.contentType === 'TEXT'
      ? [{ icon: Copy, key: 'copy', label: '复制' }]
      : conversation.contentType === 'VIDEO'
        ? [
            { icon: Download, key: 'download', label: '下载视频' },
            { icon: Star, key: 'save-scene', label: '保存到场景库' },
          ]
        : [
            { icon: Star, key: 'save-character', label: '保存到角色库' },
            { icon: ImageIcon, key: 'save-scene', label: '保存到场景库' },
          ]

  return (
    <ChatActionsBar
      items={items}
      onActionClick={({ key }) => onAction(conversation, key as ChatMessageAction)}
    />
  )
}

const NoActions = () => null

export function ToolboxChatList({ conversations, onAction, user }: ToolboxChatListProps) {
  const data: ToolboxLobeMessage[] = conversations.map((conversation) => {
    const isUser = conversation.role === 'user'
    const response = conversation.aiResponse

    return {
      content: isUser
        ? conversation.userInput?.prompt || '(无提示词)'
        : response?.text || (response?.status === 'GENERATING' ? '正在生成' : ''),
      createAt: conversation.timestamp,
      error:
        response?.status === 'FAILED'
          ? { message: response.errorMessage || '生成失败', type: 500 }
          : undefined,
      extra: { conversation, onAction },
      id: conversation.id,
      meta: isUser
        ? {
            avatar: user?.avatarUrl || <CircleUserRound size={20} />,
            backgroundColor: '#f2f4f7',
            title: user?.nickname || '我',
          }
        : {
            avatar: <Bot size={20} />,
            backgroundColor: '#eef4ff',
            title: 'AI 助手',
          },
      role: isUser ? 'user' : 'assistant',
      updateAt: conversation.timestamp,
    }
  })

  const loadingId = conversations.find(
    (conversation) => conversation.aiResponse?.status === 'GENERATING',
  )?.id

  return (
    <ChatList
      showAvatar
      className="[&>*+*]:mt-5"
      data={data}
      loadingId={loadingId}
      renderActions={{ assistant: ToolboxMessageActions, user: NoActions }}
      renderMessages={{ assistant: ToolboxMessage, user: ToolboxMessage }}
      renderMessagesExtra={{ assistant: ToolboxMessageExtra, user: ToolboxMessageExtra }}
      text={{ copySuccess: '已复制', history: '历史消息' }}
      variant="bubble"
    />
  )
}
