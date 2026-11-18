import { Button, Checkbox, Empty, Modal, Tag, TextArea } from '@lobehub/ui'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  FilePlus2,
  FileUp,
  FolderUp,
  LoaderCircle,
  Merge,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { memo, useRef, useState } from 'react'

import { confirmAction, notify } from '@/shared/feedback/feedback'

import { useEditorStore } from '../../store'
import { BatchOperationBar } from '../batch-operation/BatchOperationBar'
import { selectedShotIdsInOrder } from './asset-binding-utils'
import {
  type RecognitionAssetType,
  recognizeAssetsForColumn,
} from './batch-asset-recognition'
import {
  STORYBOARD_GRID_TEMPLATE,
  STORYBOARD_MIN_WIDTH,
  STORYBOARD_OVERSCAN,
  STORYBOARD_ROW_HEIGHT,
} from './storyboard-layout'
import { StoryboardRow, type StoryboardRowProps } from './StoryboardRow'
import { useStoryboardImport } from './useStoryboardImport'
import { useStoryboardPolling } from './useStoryboardPolling'

export interface StoryboardTableProps {
  assetDialogs?: StoryboardRowProps['assetDialogs']
}

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

const confirmMergeOnce = async (message: string) => {
  try {
    if (localStorage.getItem('merge_confirmed')) return true
    const confirmed = await confirmAction(
      `${message}\n合并后被追加的分镜将删除。`,
      { confirmLabel: '确认合并', danger: true, title: '合并分镜' },
    )
    if (confirmed) localStorage.setItem('merge_confirmed', 'true')
    return confirmed
  } catch {
    return confirmAction(message, { confirmLabel: '确认合并', danger: true, title: '合并分镜' })
  }
}

function StoryboardTableImpl({ assetDialogs }: StoryboardTableProps) {
  const projectId = useEditorStore((state) => state.projectId)
  const shots = useEditorStore((state) => state.shots)
  const loading = useEditorStore((state) => state.loading)
  const selectedShotIds = useEditorStore((state) => state.selectedShotIds)
  const allSelected = useEditorStore((state) => state.allSelected)
  const hasSelection = useEditorStore((state) => state.hasSelection)
  const selectAll = useEditorStore((state) => state.selectAll)
  const deselectAll = useEditorStore((state) => state.deselectAll)
  const toggleShotSelection = useEditorStore((state) => state.toggleShotSelection)
  const updateShot = useEditorStore((state) => state.updateShot)
  const mergeShots = useEditorStore((state) => state.mergeShots)
  const deleteShot = useEditorStore((state) => state.deleteShot)
  const createShot = useEditorStore((state) => state.createShot)
  const parseAndCreateShots = useEditorStore((state) => state.parseAndCreateShots)
  const fetchShots = useEditorStore((state) => state.fetchShots)
  const fetchCharacters = useEditorStore((state) => state.fetchCharacters)
  const fetchScenes = useEditorStore((state) => state.fetchScenes)
  const fetchProps = useEditorStore((state) => state.fetchProps)
  const activeJobCount = useEditorStore((state) => state.activeJobs.length)
  const pollActiveJobs = useEditorStore((state) => state.pollActiveJobs)
  const [addOpen, setAddOpen] = useState(false)
  const [parseOpen, setParseOpen] = useState(false)
  const [recognizing, setRecognizing] = useState<RecognitionAssetType | null>(null)
  const [newShotScript, setNewShotScript] = useState('')
  const [fullScript, setFullScript] = useState('')
  const importInputRef = useRef<HTMLInputElement>(null)
  const supplementInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const rowVirtualizer = useVirtualizer({
    count: shots.length,
    estimateSize: () => STORYBOARD_ROW_HEIGHT,
    getScrollElement: () => scrollRef.current,
    overscan: STORYBOARD_OVERSCAN,
  })
  const storyboardImport = useStoryboardImport({
    fetchCharacters,
    fetchProps,
    fetchScenes,
    fetchShots,
    parseAndCreateShots,
    projectId,
  })

  useStoryboardPolling(shots, activeJobCount, pollActiveJobs)

  const handleMergeUp = async (index: number) => {
    if (index <= 0 || !(await confirmMergeOnce('确定将当前分镜合并到上一条吗？'))) return
    await mergeShots([shots[index - 1].id, shots[index].id])
  }
  const handleMergeDown = async (index: number) => {
    if (
      index >= shots.length - 1 ||
      !(await confirmMergeOnce('确定将下一条分镜合并到当前分镜吗？'))
    )
      return
    await mergeShots([shots[index].id, shots[index + 1].id])
  }
  const handleDeleteSelected = async () => {
    const orderedIds = selectedShotIdsInOrder(shots, selectedShotIds)
    if (!(await confirmAction(`确定删除选中的 ${orderedIds.length} 条分镜吗？`, {
      confirmLabel: '删除分镜', danger: true, title: '批量删除',
    }))) return
    for (const shotId of orderedIds) await deleteShot(shotId)
    deselectAll()
  }
  const handleMergeSelected = async () => {
    const orderedIds = selectedShotIdsInOrder(shots, selectedShotIds)
    if (orderedIds.length < 2) return
    if (!(await confirmAction(`确定将选中的 ${orderedIds.length} 条分镜合并为一条吗？`, {
      confirmLabel: '确认合并', danger: true, title: '合并分镜',
    }))) return
    await mergeShots(orderedIds)
  }
  const handleAddShot = async () => {
    const scriptText = newShotScript.trim()
    if (!scriptText) return
    await createShot(scriptText)
    setNewShotScript('')
    setAddOpen(false)
  }
  const handleParse = async () => {
    const scriptText = fullScript.trim()
    if (!scriptText) return
    try {
      const result = await storyboardImport.parseScript(scriptText)
      if (result === 'completed') {
        setFullScript('')
        setParseOpen(false)
      }
    } catch (error) {
      if (!storyboardImport.parsing) notify.error(errorMessage(error, 'AI 解析失败'))
    }
  }
  const handleImportFiles = async (files: File[]) => {
    try {
      const summary = await storyboardImport.importStoryboard(files)
      notify.success(
        `导入成功：新增 ${summary.shotsCreated} 条分镜，匹配图片 ${summary.imagesMatched || 0} 张`,
      )
    } catch (error) {
      notify.error(errorMessage(error, '导入失败，请检查 Excel 格式'))
    }
  }
  const handleSupplementImages = async (files: File[]) => {
    try {
      const summary = await storyboardImport.supplementImages(files)
      notify.success(`补图完成：匹配图片 ${summary.imagesMatched || 0} 张`)
    } catch (error) {
      notify.error(errorMessage(error, '补图失败，请检查图片文件名'))
    }
  }
  // 整列一键识别：从各分镜脚本提取未绑定的该类资产，静默创建并绑定。
  // 始终可点击——识别不到就提示，而不是禁用按钮。
  const handleRecognize = async (assetType: RecognitionAssetType, label: string) => {
    if (!projectId || recognizing) return
    setRecognizing(assetType)
    try {
      const state = useEditorStore.getState()
      const count = await recognizeAssetsForColumn(assetType, {
        characters: state.characters,
        projectId,
        props: state.props,
        scenes: state.scenes,
        shots: state.shots,
      })
      if (count === 0) {
        notify.warning(`未检测到未被识别的${label}`)
        return
      }
      await Promise.all([fetchCharacters(), fetchScenes(), fetchProps(), fetchShots()])
      notify.success(`已识别并绑定 ${count} 个${label}`)
    } catch (error) {
      notify.error(errorMessage(error, `识别${label}失败`))
    } finally {
      setRecognizing(null)
    }
  }
  const recognizeButton = (assetType: RecognitionAssetType, label: string) => (
    <Button
      className="!h-auto !px-1 !text-xs"
      disabled={recognizing !== null && recognizing !== assetType}
      icon={Sparkles}
      loading={recognizing === assetType}
      size="small"
      title={`一键识别${label}（整列：未绑定的自动创建并绑定）`}
      type="link"
      onClick={() => void handleRecognize(assetType, label)}
    >
      识别
    </Button>
  )

  return (
    <section className="storyboard-surface relative flex h-full min-h-0 flex-col overflow-hidden rounded-xl border">
      {storyboardImport.importing || storyboardImport.supplementing ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/72 backdrop-blur-[3px]">
          <div className="w-[min(420px,calc(100%-32px))] rounded-2xl border border-sky-100 bg-white/95 p-5 shadow-[0_24px_80px_rgba(56,189,248,0.18)]">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                <LoaderCircle className="size-5 animate-spin" />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {storyboardImport.importing ? '正在导入分镜与素材…' : '正在匹配并补充图片…'}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">分镜和资产会一起完成加载，请勿关闭页面</p>
              </div>
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-sky-50">
              <div className="h-full w-2/5 animate-[pulse_1.1s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-cyan-400 via-sky-500 to-blue-500" />
            </div>
          </div>
        </div>
      ) : null}
      <header className="storyboard-toolbar flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-slate-900">分镜表</h2>
          <Tag>{shots.length} 条</Tag>
          {hasSelection ? (
            <>
              <span className="text-sm text-slate-500">已选 {selectedShotIds.size} 条</span>
              {selectedShotIds.size >= 2 ? (
                <Button icon={Merge} size="small" onClick={() => void handleMergeSelected()}>
                  合并选中
                </Button>
              ) : null}
              <Button
                danger
                icon={Trash2}
                size="small"
                onClick={() => void handleDeleteSelected()}
              >
                删除选中
              </Button>
            </>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            hidden
            multiple
            accept=".xlsx,image/*"
            ref={importInputRef}
            type="file"
            onChange={(event) => {
              const files = [...(event.target.files || [])]
              event.target.value = ''
              if (files.length > 0) void handleImportFiles(files)
            }}
          />
          <input
            hidden
            multiple
            accept="image/*"
            ref={supplementInputRef}
            type="file"
            {...({ directory: '', webkitdirectory: '' } as Record<string, string>)}
            onChange={(event) => {
              const files = [...(event.target.files || [])]
              event.target.value = ''
              if (files.length > 0) void handleSupplementImages(files)
            }}
          />
          <Button
            disabled={storyboardImport.importing}
            icon={FileUp}
            loading={storyboardImport.importing}
            onClick={() => importInputRef.current?.click()}
          >
            导入分镜表格
          </Button>
          <Button
            disabled={storyboardImport.supplementing}
            icon={FolderUp}
            loading={storyboardImport.supplementing}
            onClick={() => supplementInputRef.current?.click()}
          >
            补充图片
          </Button>
          <Button icon={Sparkles} onClick={() => setParseOpen(true)}>
            AI 解析剧本
          </Button>
          <Button icon={Plus} type="primary" onClick={() => setAddOpen(true)}>
            添加分镜
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto" ref={scrollRef}>
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">加载中…</div>
        ) : shots.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <Empty
              description="暂无分镜"
              image={<FilePlus2 aria-hidden className="size-16 text-slate-300" />}
              title="从第一条分镜开始"
            >
              <Button icon={Plus} onClick={() => setAddOpen(true)}>
                添加第一条分镜
              </Button>
            </Empty>
          </div>
        ) : (
          <div style={{ minWidth: STORYBOARD_MIN_WIDTH }}>
            <div
              className="storyboard-columns sticky top-0 z-10 grid items-center border-b text-left text-xs font-semibold"
              style={{ gridTemplateColumns: STORYBOARD_GRID_TEMPLATE }}
            >
              <div className="px-2 py-2.5">
                <Checkbox
                  backgroundColor="#4f9f94"
                  checked={allSelected}
                  className="storyboard-checkbox"
                  indeterminate={hasSelection && !allSelected}
                  onChange={() => (allSelected ? deselectAll() : selectAll())}
                />
              </div>
              <div className="px-2 py-2.5">编号</div>
              <div className="px-2 py-2.5">剧本</div>
              <div className="flex items-center gap-1 px-2 py-2.5">
                角色
                {recognizeButton('character', '角色')}
              </div>
              <div className="flex items-center gap-1 px-2 py-2.5">
                场景
                {recognizeButton('scene', '场景')}
              </div>
              <div className="flex items-center gap-1 px-2 py-2.5">
                道具
                {recognizeButton('prop', '道具')}
              </div>
              <div className="px-2 py-2.5">分镜图</div>
              <div className="px-2 py-2.5">视频</div>
              <div className="px-2 py-2.5">操作</div>
            </div>
            <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const index = virtualRow.index
                const shot = shots[index]
                return (
                  <div
                    key={shot.id}
                    style={{
                      height: virtualRow.size,
                      left: 0,
                      position: 'absolute',
                      top: 0,
                      transform: `translateY(${virtualRow.start}px)`,
                      width: '100%',
                    }}
                  >
                    <StoryboardRow
                      assetDialogs={assetDialogs}
                      isFirst={index === 0}
                      isLast={index === shots.length - 1}
                      selected={selectedShotIds.has(shot.id)}
                      shot={shot}
                      onMergeDown={() => void handleMergeDown(index)}
                      onMergeUp={() => void handleMergeUp(index)}
                      onToggleSelect={() => toggleShotSelection(shot.id)}
                      onUpdateScript={(scriptText) => updateShot(shot.id, scriptText)}
                      onDelete={() => {
                        void confirmAction('确定删除这条分镜吗？', {
                          confirmLabel: '删除分镜', danger: true, title: '删除分镜',
                        }).then((confirmed) => {
                          if (confirmed) void deleteShot(shot.id)
                        })
                      }}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {addOpen ? (
        <Modal
          centered
          open
          title="添加新分镜"
          width={620}
          footer={
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  setNewShotScript('')
                  setAddOpen(false)
                }}
              >
                取消
              </Button>
              <Button disabled={!newShotScript.trim()} type="primary" onClick={() => void handleAddShot()}>
                添加
              </Button>
            </div>
          }
          onCancel={() => setAddOpen(false)}
        >
          <TextArea
            autoFocus
            showCount
            maxLength={4000}
            placeholder="输入剧本内容…"
            resize={false}
            rows={7}
            value={newShotScript}
            onChange={(event) => setNewShotScript(event.target.value)}
          />
        </Modal>
      ) : null}

      {parseOpen ? (
        <Modal
          centered
          open
          maskClosable={!storyboardImport.parsing}
          title="AI 解析剧本"
          width={760}
          footer={
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  if (storyboardImport.parsing) storyboardImport.cancelParse()
                  else {
                    setFullScript('')
                    setParseOpen(false)
                  }
                }}
              >
                {storyboardImport.parsing ? '取消解析' : '关闭'}
              </Button>
              <Button
                disabled={storyboardImport.parsing || !fullScript.trim()}
                loading={storyboardImport.parsing}
                type="primary"
                onClick={() => void handleParse()}
              >
                {storyboardImport.parsing
                  ? `解析中… ${storyboardImport.parseSeconds}s`
                  : '开始解析'}
              </Button>
            </div>
          }
          onCancel={() => {
            if (!storyboardImport.parsing) setParseOpen(false)
          }}
        >
          <p className="mb-3 text-sm text-slate-500">
            粘贴完整剧本，AI 将拆分分镜并提取角色、场景与道具。
          </p>
          <TextArea
            autoFocus
            disabled={storyboardImport.parsing}
            placeholder="粘贴完整剧本…"
            resize={false}
            rows={16}
            value={fullScript}
            onChange={(event) => setFullScript(event.target.value)}
          />
        </Modal>
      ) : null}

      <BatchOperationBar />
    </section>
  )
}

// Memoized so EditorPage's modal/menu state toggles (model config, export, the
// three-dot menu, generate dialogs) no longer force a full storyboard re-render.
// The only prop, `assetDialogs`, is a stable `useMemo(..., [])` from EditorPage.
export const StoryboardTable = memo(StoryboardTableImpl)
