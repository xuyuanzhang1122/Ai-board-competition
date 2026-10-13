import { useEffect, useMemo, useState } from 'react'

import {
  createHoverPreviewController,
  EMPTY_HOVER_PREVIEW,
  type HoverPreviewPayload,
} from './hover-preview'

export function useHoverPreview(delay = 680) {
  const [preview, setPreview] = useState(EMPTY_HOVER_PREVIEW)
  const controller = useMemo(() => createHoverPreviewController(setPreview, delay), [delay])

  useEffect(() => {
    // React StrictMode intentionally runs an extra setup/cleanup cycle in
    // development. Reactivate the controller on every effect setup so that
    // the simulated cleanup cannot permanently disable hover interactions.
    controller.activate()
    return () => controller.dispose()
  }, [controller])

  return {
    hidePreview: controller.hide,
    movePreview: (event: React.MouseEvent) => controller.move(event.clientX, event.clientY),
    movePreviewTo: controller.move,
    preview,
    showPreviewAt: controller.show,
    showPreview: (event: React.MouseEvent, payload: Omit<HoverPreviewPayload, 'x' | 'y'>) =>
      controller.show({ ...payload, x: event.clientX, y: event.clientY }),
  }
}
