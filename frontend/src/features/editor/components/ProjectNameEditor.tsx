import { Button, Input } from '@lobehub/ui'
import { Check, Pencil, X } from 'lucide-react'
import { useState } from 'react'

import type { ProjectVO } from '@/shared/types/api'

export interface ProjectNameEditorProps {
  onSave: (name: string) => Promise<void> | void
  project: ProjectVO | null
}

export function ProjectNameEditor({ onSave, project }: ProjectNameEditorProps) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(project?.name ?? '')
  const [loading, setLoading] = useState(false)

  const startEditing = () => {
    setValue(project?.name ?? '')
    setEditing(true)
  }

  const commit = async () => {
    const name = value.trim()
    if (!name || name === project?.name) {
      setEditing(false)
      return
    }
    setLoading(true)
    try {
      await onSave(name)
    } finally {
      setLoading(false)
      setEditing(false)
    }
  }

  const cancel = () => {
    setValue(project?.name ?? '')
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        className="group flex max-w-md items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-slate-100"
        type="button"
        onClick={startEditing}
      >
        <span className="truncate text-base font-semibold text-slate-900">
          {project?.name || '未命名项目'}
        </span>
        <Pencil className="size-4 shrink-0 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        autoFocus
        className="w-64"
        disabled={loading}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            void commit()
          } else if (event.key === 'Escape') {
            cancel()
          }
        }}
      />
      <Button icon={Check} loading={loading} size="small" onClick={() => void commit()} />
      <Button disabled={loading} icon={X} size="small" onClick={cancel} />
    </div>
  )
}
