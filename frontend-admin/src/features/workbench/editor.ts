export interface Editor<T> {
  dirty: boolean
  error: string
  value: T
}
export const initialEditor = <T>(value: T): Editor<T> => ({ value, dirty: false, error: '' })
export const edit = <T>(state: Editor<T>, value: T): Editor<T> => ({ ...state, value, dirty: true })
export const saved = <T>(_state: Editor<T>, value: T): Editor<T> => initialEditor(value)
export const failed = <T>(state: Editor<T>, error: string): Editor<T> => ({ ...state, error })
