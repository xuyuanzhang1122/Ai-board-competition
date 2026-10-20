import { ImageOff, X } from 'lucide-react'

import type { BoundPropVO } from '@/shared/types/api'

interface PropBindingListProps {
  onOpen: (propId: number) => void
  onRemove: (bindingId: number) => void
  props: BoundPropVO[]
}

export function PropBindingList({ onOpen, onRemove, props }: PropBindingListProps) {
  return (
    <ul aria-label="本镜道具" className="max-h-72 space-y-1 overflow-y-auto overscroll-contain">
      {props.map((prop) => (
        <li className="flex items-center gap-2" key={prop.bindingId}>
          <button
            aria-label={`查看${prop.propName}`}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-2 text-left hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-500"
            type="button"
            onClick={() => onOpen(prop.propId)}
          >
            {prop.thumbnailUrl ? (
              <img
                alt=""
                className="size-10 shrink-0 rounded object-cover"
                loading="lazy"
                src={prop.thumbnailUrl}
              />
            ) : (
              <ImageOff
                aria-hidden
                className="size-10 shrink-0 rounded bg-slate-100 p-2 text-slate-400"
              />
            )}
            <span className="min-w-0 break-words text-sm">{prop.propName}</span>
          </button>
          <button
            aria-label={`移除${prop.propName}`}
            className="shrink-0 rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-blue-500"
            title="仅移除本镜绑定"
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onRemove(prop.bindingId)
            }}
          >
            <X aria-hidden className="size-4" />
          </button>
        </li>
      ))}
    </ul>
  )
}
