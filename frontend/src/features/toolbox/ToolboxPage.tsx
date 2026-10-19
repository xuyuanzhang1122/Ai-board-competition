import './toolbox.css'

import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  House,
  LoaderCircle,
  MessageSquare,
  PanelLeft,
  Search,
  Sparkles,
  SquarePen,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useStore } from 'zustand'

import { modelApi } from '@/features/editor/model-api'
import type { ModelVO } from '@/shared/types/api'

import type { MessageType } from './api'
import { ChatComposer } from './components/ChatComposer'
import { ConversationMessage } from './components/ChatMessage'
import { chatStore, isActiveTask } from './store'

export function ToolboxPage() {
  const state = useStore(chatStore)
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const path = useParams<{ id: string }>()
  const sessionParam = params.get('session') || path.id
  const sessionId = sessionParam && /^\d+$/.test(sessionParam) ? Number(sessionParam) : null
  const [historyOpen, setHistoryOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [content, setContent] = useState('')
  const [type, setType] = useState<MessageType>('TEXT')
  const [models, setModels] = useState<ModelVO[]>([])
  const [model, setModel] = useState('')
  const [modelError, setModelError] = useState('')
  const [creating, setCreating] = useState(false)
  const [modelReload, setModelReload] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const hasMessages = state.messages.length > 0
  const activeTasks = state.messages.some(isActiveTask)
  useEffect(() => {
    void chatStore.getState().list()
  }, [])
  useEffect(() => {
    let mounted = true
    void modelApi
      .getModels('LANGUAGE')
      .then((items) => {
        if (!mounted) return
        const available = items.filter((item) => item.enabled === 1)
        setModels(available)
        setModel((previous) =>
          available.some((item) => item.code === previous) ? previous : available[0]?.code || '',
        )
        setModelError('')
      })
      .catch(() => {
        if (mounted) setModelError('模型列表加载失败，请重试。')
      })
    return () => {
      mounted = false
    }
  }, [modelReload])
  useEffect(() => {
    if (chatStore.getState().activeId !== sessionId) void chatStore.getState().open(sessionId)
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      if (stopped) return
      await chatStore.getState().refresh()
      if (!stopped) timer = setTimeout(() => void poll(), 2000)
    }
    if (sessionId !== null) timer = setTimeout(() => void poll(), 2000)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [sessionId])
  const lastMessage = state.messages.at(-1)
  useEffect(() => {
    const element = scrollRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [state.messages.length, lastMessage?.status, lastMessage?.content])
  const chooseSession = (id: number | null) => {
    navigate(id === null ? '/toolbox' : `/toolbox?session=${id}`)
    if (id === null) void chatStore.getState().open(null)
    setContent('')
    setHistoryOpen(false)
  }
  const send = async () => {
    if (
      creating ||
      state.sending ||
      state.pending ||
      activeTasks ||
      !content.trim() ||
      !model ||
      type !== 'TEXT'
    )
      return
    const sentContent = content
    setCreating(true)
    try {
      const id = await chatStore.getState().ensureSession(content)
      setParams({ session: String(id) }, { replace: sessionId === null })
      await chatStore.getState().send(content, model)
      if (!chatStore.getState().pending && chatStore.getState().activeId === id)
        setContent((previous) => (previous === sentContent ? '' : previous))
    } catch (error) {
      chatStore.setState({ error: error instanceof Error ? error.message : '创建会话失败，请重试' })
    } finally {
      setCreating(false)
    }
  }
  const composer = (
    <ChatComposer
      busy={creating || state.sending}
      content={content}
      locked={activeTasks || !!state.pending || state.loading}
      model={model}
      models={models}
      type={type}
      onContentChange={setContent}
      onModelChange={setModel}
      onSend={() => void send()}
      onTypeChange={setType}
    />
  )
  const pendingHere = state.pending?.sessionId === state.activeId
  return (
    <div className="toolbox-app">
      <nav aria-label="工具箱导航" className="toolbox-rail">
        <Link aria-label="返回创作首页" className="toolbox-brand" title="返回创作首页" to="/home">
          <Sparkles size={25} />
        </Link>
        <button
          aria-label="新对话"
          title="新对话"
          type="button"
          onClick={() => chooseSession(null)}
        >
          <SquarePen size={22} />
        </button>
        <button
          aria-expanded={historyOpen}
          aria-label="会话历史"
          title="会话历史"
          type="button"
          onClick={() => setHistoryOpen((value) => !value)}
        >
          <PanelLeft size={22} />
        </button>
        <Link aria-label="创作工作台" title="创作工作台" to="/home">
          <House size={22} />
        </Link>
        <div className="toolbox-rail-bottom">
          <span title="你的不对我的队 · 参赛展示">
            <Sparkles size={18} />
          </span>
        </div>
      </nav>
      {historyOpen && (
        <>
          <button
            aria-label="关闭会话历史"
            className="toolbox-history-scrim"
            onClick={() => setHistoryOpen(false)}
          />
          <aside aria-label="会话列表" className="toolbox-history">
            <div className="toolbox-history-heading">
              <strong>你的对话</strong>
              <button aria-label="收起会话历史" onClick={() => setHistoryOpen(false)}>
                <ChevronLeft size={19} />
              </button>
            </div>
            <button className="toolbox-new-chat" onClick={() => chooseSession(null)}>
              <SquarePen size={17} />
              新对话
            </button>
            <label className="toolbox-history-search">
              <Search size={16} />
              <input
                aria-label="搜索会话"
                placeholder="搜索对话"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <div className="toolbox-session-list">
              {state.sessions
                .filter((item) => item.title.toLowerCase().includes(search.toLowerCase()))
                .map((item) => (
                  <div
                    className={`toolbox-session ${state.activeId === item.id ? 'is-active' : ''}`}
                    key={item.id}
                  >
                    <button className="toolbox-session-open" onClick={() => chooseSession(item.id)}>
                      <MessageSquare size={16} />
                      <span>{item.title || '新对话'}</span>
                    </button>
                    <button
                      aria-label={`删除会话：${item.title}`}
                      className="toolbox-session-delete"
                      onClick={() => {
                        void state.remove(item.id).then(() => {
                          if (sessionId === item.id && chatStore.getState().activeId === null)
                            chooseSession(null)
                        })
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              {state.sessions.length === 0 && <p>你的对话将保存在这里</p>}
            </div>
            <p className="toolbox-history-brand">
              你的不对我的队
              <br />
              2026 山东省首届大学生 AI 大模型创新传播大赛
            </p>
          </aside>
        </>
      )}
      <main className="toolbox-main">
        <header className="toolbox-header">
          <Link to="/home">
            创作工具箱
            <ChevronDown size={15} />
          </Link>
          <span>
            {state.sessions.find((item) => item.id === state.activeId)?.title || '新对话'}
          </span>
        </header>
        {(state.error || state.pending || modelError) && (
          <div className="toolbox-notice" role="alert">
            <span>
              {state.error ||
                (state.pending ? '有一条消息尚未确认受理，请用原请求重试。' : modelError)}
            </span>
            {state.pending && (
              <button
                disabled={state.sending}
                onClick={() => {
                  if (!pendingHere) chooseSession(state.pending!.sessionId)
                  void state.retry().then(() => {
                    if (!chatStore.getState().pending) setContent('')
                  })
                }}
              >
                {state.sending ? '正在确认…' : '重试原请求'}
              </button>
            )}
            {modelError && (
              <button onClick={() => setModelReload((value) => value + 1)}>重新加载模型</button>
            )}
            {state.error && !state.pending && (
              <button aria-label="关闭提示" onClick={state.clearError}>
                <X size={15} />
              </button>
            )}
          </div>
        )}
        {state.loading ? (
          <div className="toolbox-loading" role="status">
            <LoaderCircle className="toolbox-spinner" size={21} />
            正在加载对话…
          </div>
        ) : hasMessages ? (
          <>
            <div className="toolbox-scroll" ref={scrollRef}>
              <div className="toolbox-conversation">
                {state.messages.map((item) => (
                  <ConversationMessage
                    key={item.id}
                    message={item}
                    onCancel={(id) => void state.cancel(id)}
                  />
                ))}
              </div>
            </div>
            <footer className="toolbox-footer">
              <p className="toolbox-disclaimer">AI 生成内容可能有误，请核实重要信息。</p>
              {composer}
              <p className="toolbox-competition-note">
                本版本仅供参赛展示与评审使用，非正式商业版本
              </p>
            </footer>
          </>
        ) : (
          <section className="toolbox-empty">
            <div className="toolbox-empty-content">
              <h1>今天想聊点什么？</h1>
              {composer}
              <div className="toolbox-suggestions">
                <button onClick={() => setContent('帮我把一个创意整理成完整的故事大纲')}>
                  <BookOpen size={18} />
                  把一个灵感，变成故事大纲
                </button>
                <button onClick={() => setContent('和我一起构思一个有记忆点的角色')}>
                  <MessageSquare size={18} />
                  一起构思一个有记忆点的角色
                </button>
                <button onClick={() => setContent('帮我润色文案，让表达更清晰生动')}>
                  <Sparkles size={18} />
                  让文字更清晰，让创意更生动
                </button>
              </div>
            </div>
            <p className="toolbox-empty-brand">
              你的不对我的队 · 2026 山东省首届大学生 AI 大模型创新传播大赛
              <br />
              <span>本版本仅供参赛展示与评审使用，非正式商业版本</span>
            </p>
          </section>
        )}
      </main>
    </div>
  )
}
