export const MAX_CHAT_LENGTH = 10000
export const getComposerError = (content: string): string =>
  content.length > MAX_CHAT_LENGTH
    ? `消息超过 ${MAX_CHAT_LENGTH} 字，请精简后发送。原文已保留。`
    : ''
