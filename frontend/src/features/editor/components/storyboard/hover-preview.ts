export interface HoverPreviewPayload {
  description?: string | null
  imageUrl?: string | null
  key: string
  name: string
  x: number
  y: number
}

export interface HoverPreviewState extends HoverPreviewPayload {
  visible: boolean
}

export const EMPTY_HOVER_PREVIEW: HoverPreviewState = {
  imageUrl: null,
  key: '',
  name: '',
  visible: false,
  x: 0,
  y: 0,
}

export const calculateHoverPosition = ({
  estimatedHeight,
  offset = 16,
  viewportHeight,
  viewportWidth,
  width,
  x,
  y,
}: {
  estimatedHeight: number
  offset?: number
  viewportHeight: number
  viewportWidth: number
  width: number
  x: number
  y: number
}) => ({
  left: Math.max(12, Math.min(x + offset, viewportWidth - width - 12)),
  top: Math.max(12, Math.min(y + offset, viewportHeight - estimatedHeight - 12)),
})

export const createHoverPreviewController = (
  onChange: (state: HoverPreviewState) => void,
  delay = 680,
) => {
  let disposed = false
  let pendingKey: string | null = null
  let state = EMPTY_HOVER_PREVIEW
  let timer: ReturnType<typeof setTimeout> | null = null

  const clearTimer = () => {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
  }

  return {
    activate() {
      disposed = false
    },
    dispose() {
      disposed = true
      pendingKey = null
      clearTimer()
    },
    hide() {
      pendingKey = null
      clearTimer()
      // Clear the key as well as visibility. Asset tiles use the pending key to
      // render the 680ms sweep; retaining it would restart the sweep after the
      // pointer had already left the tile.
      state = { ...EMPTY_HOVER_PREVIEW }
      if (!disposed) onChange(state)
    },
    move(x: number, y: number) {
      if (disposed || (!state.visible && !pendingKey)) return
      state = { ...state, x, y }
      onChange(state)
    },
    show(payload: HoverPreviewPayload) {
      if (disposed) return
      clearTimer()
      pendingKey = payload.key
      state = { ...payload, visible: false }
      onChange(state)
      timer = setTimeout(() => {
        if (disposed || pendingKey !== payload.key) return
        pendingKey = null
        timer = null
        state = { ...state, visible: true }
        onChange(state)
      }, delay)
    },
  }
}
