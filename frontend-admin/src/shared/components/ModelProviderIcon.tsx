import { DeepSeek, Doubao, Gemini, Grok, OpenAI } from '@lobehub/icons'
import { Shapes } from 'lucide-react'

export function ModelProviderIcon({
  code = '',
  provider = '',
  size = 18,
}: {
  code?: string
  provider?: string | null
  size?: number
}) {
  const identity = `${code} ${provider}`.toLowerCase()
  if (identity.includes('gemini') || identity.includes('google')) return <Gemini.Color size={size} />
  if (identity.includes('gpt') || identity.includes('openai')) return <OpenAI size={size} />
  if (identity.includes('deepseek')) return <DeepSeek.Color size={size} />
  if (identity.includes('doubao') || identity.includes('seedance')) return <Doubao.Color size={size} />
  if (identity.includes('grok') || identity.includes('xai')) return <Grok size={size} />
  return <Shapes className="text-muted-foreground" style={{ height: size, width: size }} />
}
