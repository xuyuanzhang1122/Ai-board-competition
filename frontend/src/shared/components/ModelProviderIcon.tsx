import { AiStudio, DeepSeek, Doubao, Gemini, Grok, OpenAI } from '@lobehub/icons'
import { Shapes } from 'lucide-react'

interface ModelProviderIconProps {
  code?: string
  provider?: string | null
  size?: number
}

export function ModelProviderIcon({ code = '', provider = '', size = 16 }: ModelProviderIconProps) {
  const identity = `${code} ${provider}`.toLowerCase()
  if (identity.includes('gemini') || identity.includes('google')) return <Gemini.Color size={size} />
  if (identity.includes('gpt') || identity.includes('openai')) return <OpenAI size={size} />
  if (identity.includes('deepseek')) return <DeepSeek.Color size={size} />
  if (identity.includes('doubao') || identity.includes('seedance')) {
    return <Doubao.Color size={size} />
  }
  if (identity.includes('grok') || identity.includes('xai')) return <Grok size={size} />
  if (identity.includes('agnes') || identity.includes('geeknow')) return <AiStudio size={size} />
  return <Shapes aria-hidden className="text-muted-foreground" style={{ height: size, width: size }} />
}

export function modelOptionLabel(model: { code: string; name: string; provider?: string | null }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <ModelProviderIcon code={model.code} provider={model.provider} />
      <span className="truncate">{model.name}</span>
    </span>
  )
}
