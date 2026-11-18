import { describe, expect, it } from 'vitest'

import { importChatDocument } from './chat-input-document'
import { MAX_CHAT_LENGTH } from './composer-validation'

describe('importChatDocument', () => {
  it('imports UTF-8 text into the existing draft without sending it', async () => {
    const file = new File(['蓬莱岸\n海上云涛'], '分镜.MD')
    await expect(importChatDocument(file, () => '提炼故事线索')).resolves.toBe(
      '提炼故事线索\n\n【文档：分镜.MD】\n蓬莱岸\n海上云涛',
    )
  })

  it.each(['海岸.png', '简报.pdf', '简报.docx'])('reports unsupported content for %s', async (name) => {
    await expect(importChatDocument(new File(['example'], name), () => '原有草稿')).rejects.toThrow(
      '当前文字模型无法读取',
    )
  })

  it('rejects rather than truncates imported text when the whole draft is too long', async () => {
    const file = new File(['一行文本'], '故事.txt')
    await expect(importChatDocument(file, () => '字'.repeat(MAX_CHAT_LENGTH))).rejects.toThrow('超过')
  })

  it('rejects binary data with a plain text extension', async () => {
    const file = new File([new Uint8Array([0xff, 0xfe, 0, 1])], '故事.txt')
    await expect(importChatDocument(file, () => '')).rejects.toThrow('UTF-8')
  })
})
