import '../creation/creation.css'
import './brainstorm.css'

import { useNavigate, useParams } from 'react-router-dom'

import { BRANDING } from '@/shared/constants/config'
import { useUserStore } from '@/shared/store/user'

import { BriefEditor } from '../creation/editors'
import { KnowledgeBrowser } from './KnowledgeBrowser'
import { OutlineEditor } from './OutlineEditor'
import { RunEvidence } from './RunEvidence'
import { canConfirm, canUseRun, normalizedOutline } from './state'
import { useBrainstorm } from './useBrainstorm'

export function BrainstormPage() {
  const userId = useUserStore((state) => state.userId)
  const token = useUserStore((state) => state.token)
  const { id } = useParams()
  if (!userId || !token) return null
  return <BrainstormSession key={`${userId}:${token}:${id ?? 'new'}`} route={id ?? 'new'} token={token} userId={userId} />
}

function BrainstormSession({ userId, token, route }: { userId: number; token: string; route: string }) {
  const w = useBrainstorm(userId, token, route)
  const navigate = useNavigate()
  const { draft, brief, outline, dirty, revision, pending, busy, loading } = w
  const locked = busy || loading || !!pending || (route !== 'new' && !draft)
  const conflict = !!draft && revision !== draft.revision
  const saved = !!draft && !dirty && !conflict && !locked
  const running = draft?.runs.some((run) => ['PENDING', 'RUNNING'].includes(run.status)) ?? false
  const save = () => void w.send(draft ? { kind: 'save', id: draft.id, payload: { revision, brief, outline: normalizedOutline(outline) } }
    : { kind: 'create', payload: { requestId: crypto.randomUUID(), brief } })

  return (
    <div className="creation-page">
      <header className="creation-header">
        <div><p className="creation-eyebrow">{BRANDING.competition} · {BRANDING.teamName}</p><h1>头脑风暴</h1><p>查阅资料 → 生成多个方向 → 人工选择与确认 → 落笔生辉。工具步骤和修改全程留痕。</p></div>
        <div className="creation-actions"><button type="button" onClick={() => navigate('/brainstorm')}>新建头脑风暴</button><button type="button" onClick={() => navigate('/toolbox')}>文字对话与历史</button></div>
      </header>
      <div className="creation-layout">
        <aside className="creation-sidebar creation-card"><h2>我的头脑风暴</h2>
          {loading && <p role="status">加载中…</p>}
          {w.drafts.map((item) => <button aria-current={item.id === draft?.id ? 'page' : undefined} className="creation-draft-link" key={item.id} type="button" onClick={() => navigate(`/brainstorm/${item.id}`)}><strong>{item.brief.theme}</strong><span>版本 {item.revision}{item.confirmed ? ' · 已确认' : ''}</span></button>)}
          <p className="creation-hint">关闭页面不会停止已受理运行。未知受理状态只能重试原请求，不另发生成。</p>
        </aside>
        <main className="creation-workspace">
          {(w.error || w.storageError) && <div aria-live="polite" className="creation-notice" role="alert">{w.error}<br />{w.storageError}</div>}
          {conflict && <p className="creation-notice">服务端已更新到版本 {draft?.revision}，本机编辑基于版本 {revision}。已保留本机内容，请复制需要的修改后重新读取。</p>}
          {pending && !busy && <section className="creation-notice"><h2>原请求受理状态待确认</h2><p>重试沿用已保存的请求 ID 和输入，不会自动生成第二份任务。</p><button type="button" onClick={() => void w.send(pending)}>重试原请求</button><details><summary>原始请求</summary><pre>{JSON.stringify(pending, null, 2)}</pre></details></section>}
          <section className="creation-card creation-stack">
            <h2>1 · 参赛创作需求</h2>
            <fieldset className="creation-editor" disabled={locked}><BriefEditor brief={brief} onChange={(next) => w.edit(next, outline)} /></fieldset>
            <div className="creation-actions"><button disabled={locked || (!!draft && !dirty)} type="button" onClick={save}>{draft ? '保存修改' : '保存创作需求'}</button>{dirty && <button disabled={locked} type="button" onClick={() => void w.discard()}>放弃本机编辑并重新读取</button>}<span className="creation-hint">{draft ? `#${draft.id} · 版本 ${draft.revision}` : '未保存'}{dirty ? ' · 有未保存编辑' : ''}{busy ? ' · 正在处理…' : ''}</span></div>
          </section>
          <KnowledgeBrowser load={w.api.knowledge} />
          <section className="creation-card creation-stack">
            <h2>2 · 受控工具与大纲候选</h2>
            <p className="creation-hint">模型可检索已审核知识、搜索/读取公开资料、校验引用或请求补充。外部页面均未经审核；限制由服务端执行，达到上限会转人工。</p>
            <label className="creation-field"><span>官方文字模型</span><select disabled={locked || running} value={w.model} onChange={(event) => w.setModel(event.target.value)}>{!w.models.length && <option value="">暂无可用模型</option>}{w.models.map((model) => <option key={model.id} value={model.code}>{model.name} · {model.provider}</option>)}</select></label>
            <button disabled={!saved || running || !w.model} type="button" onClick={() => draft && void w.send({ kind: 'run', id: draft.id, payload: { requestId: crypto.randomUUID(), revision: draft.revision, model: w.model } })}>{running ? '后台运行中…' : '生成大纲方向'}</button>
            {draft?.runs.map((run) => <RunEvidence adopt={() => void w.send({ kind: 'adopt', id: draft.id, runId: run.id, payload: { revision: draft.revision } })} canAdopt={!locked && !conflict && canUseRun(draft, run, dirty)} key={run.id} run={run} />)}
          </section>
          <section className="creation-card creation-stack">
            <h2>3 · 人工选择、修改与确认</h2>
            <p className="creation-hint">采用候选后可编辑每个方向，并填写采用与放弃理由。保存后确认选中方向；后续改动将清除确认。</p>
            <fieldset className="creation-editor" disabled={locked}>{outline ? <OutlineEditor outline={outline} onChange={(next) => w.edit(brief, next)} /> : <p>尚无大纲，请先生成并采用候选。</p>}</fieldset>
            <div className="creation-actions"><button disabled={locked || !dirty} type="button" onClick={save}>保存大纲修改</button><button disabled={!saved || !draft || !canConfirm(draft, outline, revision, dirty)} type="button" onClick={() => draft && void w.send({ kind: 'confirm', id: draft.id, payload: { revision: draft.revision } })}>{draft?.confirmed && !dirty ? '大纲已确认' : '确认选中大纲'}</button></div>
          </section>
          <section className="creation-card creation-stack">
            <h2>4 · 落笔生辉与过程导出</h2>
            <p className="creation-hint">确认的大纲与来源保存为新剧本创作的输入快照。之后编辑头脑风暴不会覆盖已转入的内容。</p>
            <div className="creation-actions"><button disabled={!saved || !draft?.confirmed} type="button" onClick={() => draft && void w.send({ kind: 'handoff', id: draft.id, payload: { revision: draft.revision, requestId: crypto.randomUUID() } })}>转入落笔生辉</button><button disabled={!draft || locked} type="button" onClick={() => void w.download()}>导出来源与过程记录</button>{draft?.creationDraftId && <button type="button" onClick={() => navigate(`/creation/${draft.creationDraftId}`)}>打开已转入创作</button>}</div>
          </section>
          <footer className="creation-hint">{BRANDING.disclaimer}</footer>
        </main>
      </div>
    </div>
  )
}
