import { useEffect, useRef, useState } from 'react'

import type { Knowledge } from './api'

export function KnowledgeBrowser({ load }: { load: (query: string) => Promise<Knowledge[]> }) {
  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<Knowledge[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const aliveRef = useRef(true)
  const sequenceRef = useRef(0)
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false } }, [])
  const search = async () => {
    const sequence = ++sequenceRef.current
    setBusy(true); setError('')
    try {
      const result = await load(query)
      if (aliveRef.current && sequence === sequenceRef.current) setEntries(result)
    } catch (error) {
      if (aliveRef.current && sequence === sequenceRef.current) setError(error instanceof Error ? error.message : '知识加载失败')
    } finally { if (aliveRef.current && sequence === sequenceRef.current) setBusy(false) }
  }
  return (
    <details className="creation-card">
      <summary>查看已审核知识与授权说明</summary>
      <p className="creation-hint">仅列出管理员已审核且未过期的条目。人工审核不等于自动保证史实或素材授权。</p>
      <div className="creation-actions">
        <label className="creation-field"><span>检索词（留空查看全部）</span><input maxLength={200} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <button disabled={busy} type="button" onClick={() => void search()}>{busy ? '加载中…' : '查阅知识'}</button>
      </div>
      {error && <p role="alert">{error}</p>}
      {entries.map((entry) => (
        <article className="creation-run" key={entry.id}>
          <h3>{entry.title} · {({ FACT: '事实资料', LEGEND: '神话传说', FICTION: '创作演绎' })[entry.factType]}</h3>
          <p className="creation-hint">引用 ID：knowledge-{entry.id}-v{entry.revision} · {entry.sourceOrganization} · 有效至 {entry.validUntil ?? '未设到期日期'}</p>
          <p>{entry.content}</p>
          <p>授权说明：{entry.license}</p>
          {/^https:\/\//i.test(entry.sourceUrl) && <a href={entry.sourceUrl} rel="noreferrer" target="_blank">查看原始来源</a>}
        </article>
      ))}
    </details>
  )
}
