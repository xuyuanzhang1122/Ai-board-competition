import { getComposerError, MAX_CHAT_LENGTH } from './composer-validation'

const textExtensions = ['.txt', '.md', '.csv', '.json']

export const CHAT_FILE_ACCEPT = ['image/*', '.pdf', '.doc', '.docx', ...textExtensions].join(',')

export async function importChatDocument(file: File, getDraft: () => string): Promise<string> {
  if (!textExtensions.some((extension) => file.name.toLowerCase().endsWith(extension))) {
    throw new Error('当前文字模型无法读取照片、PDF 或 Word 文件。可复制文档内容，或导入 TXT、Markdown、CSV、JSON。')
  }
  if (file.size > 4 * MAX_CHAT_LENGTH) {
    throw new Error(`文档超过消息长度上限（${MAX_CHAT_LENGTH} 字），请精简后导入。`)
  }

  const bytes = await file.arrayBuffer()
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error('请使用 UTF-8 编码保存文档后再导入。')
  }
  if (text.includes('\0')) throw new Error('请选择 UTF-8 纯文本文档。')
  if (!text.trim()) throw new Error('文档没有可导入的文字。')

  const draft = getDraft()
  const name = file.name.replace(/[\r\n]/g, ' ')
  const message = `${draft}${draft ? '\n\n' : ''}【文档：${name}】\n${text}`
  const error = getComposerError(message)
  if (error) throw new Error(error)
  return message
}
