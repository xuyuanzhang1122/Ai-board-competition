import { Button } from '@lobehub/ui'
import { ImageOff, Plus } from 'lucide-react'
import { Popover } from 'radix-ui'
import { useEffect, useId, useRef, useState } from 'react'

import { notify } from '@/shared/feedback/feedback'
import type { StoryboardShotVO } from '@/shared/types/api'

import { getPropName } from './asset-binding-utils'
import { AssetSelectionModal } from './AssetSelectionModal'
import { PropBindingList } from './PropBindingList'
import type { ShotAssetBindings } from './useShotAssetBindings'

interface PropBindingsCellProps {
  bindings: ShotAssetBindings
  shot: StoryboardShotVO
}

export function PropBindingsCell({ bindings, shot }: PropBindingsCellProps) {
  const [selecting, setSelecting] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const listId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const restoringFocusRef = useRef(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cancelClose = () => clearTimeout(closeTimerRef.current)
  const closeLater = () => {
    cancelClose()
    closeTimerRef.current = setTimeout(() => {
      if (
        !contentRef.current?.contains(document.activeElement) &&
        document.activeElement !== triggerRef.current
      )
        setExpanded(false)
    }, 180)
  }
  const restoreFocus = () => {
    restoringFocusRef.current = true
    triggerRef.current?.focus()
    restoringFocusRef.current = false
  }
  useEffect(() => () => clearTimeout(closeTimerRef.current), [])
  const run = async (action: () => Promise<void>) => {
    try {
      await action()
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '移除道具失败')
    }
  }

  return (
    <>
      <div className="flex w-full flex-col gap-1.5">
        {shot.props.length > 0 ? (
          <Popover.Root open={expanded} onOpenChange={setExpanded}>
            <Popover.Anchor asChild>
              <button
                aria-controls={expanded ? listId : undefined}
                aria-expanded={expanded}
                aria-haspopup="dialog"
                aria-label={`查看全部道具，共 ${shot.props.length} 项`}
                className="flex flex-col items-center gap-1 rounded-lg p-1 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-500"
                ref={triggerRef}
                type="button"
                onClick={() => setExpanded(true)}
                onMouseLeave={closeLater}
                onFocus={() => {
                  if (!restoringFocusRef.current) setExpanded(true)
                }}
                onKeyDown={(event) => {
                  if (
                    expanded &&
                    (event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey))
                  ) {
                    event.preventDefault()
                    contentRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
                  }
                }}
                onMouseEnter={() => {
                  cancelClose()
                  setExpanded(true)
                }}
              >
                <span aria-hidden className="relative block h-14 w-[80px]">
                  {shot.props.slice(0, 3).map((prop, index) => (
                    <span
                      className="absolute top-1 flex size-10 items-center justify-center overflow-hidden rounded-lg border-2 border-white bg-slate-100 shadow-sm"
                      key={prop.bindingId}
                      style={{ left: index * 18, transform: `rotate(${(index - 1) * 6}deg)` }}
                    >
                      {prop.thumbnailUrl ? (
                        <img
                          alt=""
                          className="size-full object-cover"
                          loading="lazy"
                          src={prop.thumbnailUrl}
                        />
                      ) : (
                        <ImageOff className="size-5 text-slate-400" />
                      )}
                    </span>
                  ))}
                </span>
                <span className="text-xs text-slate-600">{shot.props.length} 个道具 · 展开</span>
              </button>
            </Popover.Anchor>
            <Popover.Portal>
              <Popover.Content
                aria-label="本镜道具列表"
                className="prop-photo-menu z-[900] w-72 max-w-[calc(100vw-24px)] rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
                collisionPadding={12}
                id={listId}
                ref={contentRef}
                side="right"
                sideOffset={6}
                onCloseAutoFocus={(event) => event.preventDefault()}
                onEscapeKeyDown={restoreFocus}
                onMouseEnter={cancelClose}
                onMouseLeave={closeLater}
                onOpenAutoFocus={(event) => event.preventDefault()}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Tab' &&
                    event.shiftKey &&
                    document.activeElement === contentRef.current?.querySelector('button')
                  ) {
                    event.preventDefault()
                    restoreFocus()
                  }
                }}
              >
                <p className="mb-2 text-sm font-medium">本镜道具（{shot.props.length}）</p>
                <PropBindingList
                  props={shot.props}
                  onRemove={(id) => void run(() => bindings.unbind(id))}
                  onOpen={(id) => {
                    setExpanded(false)
                    bindings.openProp(id)
                  }}
                />
                <Popover.Close asChild>
                  <button
                    className="mt-2 w-full rounded p-1 text-xs text-slate-500 hover:bg-slate-100"
                    type="button"
                    onClick={restoreFocus}
                  >
                    收起
                  </button>
                </Popover.Close>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        ) : null}
        <Button
          className="!w-full"
          icon={Plus}
          title="添加道具"
          type="dashed"
          onClick={() => {
            setExpanded(false)
            setSelecting(true)
          }}
        />
      </div>

      {selecting ? (
        <AssetSelectionModal
          open
          createLabel="创建新道具"
          title="绑定道具"
          assets={bindings.props.map((prop) => ({
            bound: shot.props.some(({ propId }) => propId === prop.id),
            id: prop.id,
            imageUrl: prop.thumbnailUrl,
            name: getPropName(prop),
          }))}
          onClose={() => setSelecting(false)}
          onDelete={({ id }) => bindings.deleteProp(id)}
          onBind={async (propId) => {
            await bindings.bindProp(propId)
            setSelecting(false)
          }}
          onCreate={() => {
            setSelecting(false)
            bindings.createProp()
          }}
        />
      ) : null}
    </>
  )
}
