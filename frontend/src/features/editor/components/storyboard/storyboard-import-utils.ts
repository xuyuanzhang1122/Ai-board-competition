export const isImageFile = (file: File) =>
  file.type.startsWith('image/') || /\.(?:bmp|gif|jpe?g|png|svg|webp)$/i.test(file.name)

export const splitStoryboardFiles = (files: File[]) => ({
  assetFiles: files.filter((file) => isImageFile(file)),
  spreadsheet: files.find((file) => file.name.toLowerCase().endsWith('.xlsx')),
})

export interface AbortableParseSession {
  cancel: () => void
  promise: Promise<'cancelled' | 'completed'>
}

export const runAbortableParse = ({
  onSecond,
  parse,
}: {
  onSecond: () => void
  parse: (signal: AbortSignal) => Promise<void>
}): AbortableParseSession => {
  const abortController = new AbortController()
  let cancelled = false
  const timer = setInterval(onSecond, 1000)
  const promise = parse(abortController.signal)
    .then(() => (cancelled ? 'cancelled' : 'completed') as 'cancelled' | 'completed')
    .finally(() => clearInterval(timer))

  return {
    cancel() {
      cancelled = true
      abortController.abort()
    },
    promise,
  }
}

