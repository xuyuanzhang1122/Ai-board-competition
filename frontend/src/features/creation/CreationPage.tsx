import './creation.css'

import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { BRANDING } from '@/shared/constants/config'
import { useUserStore } from '@/shared/store/user'

import { BriefEditor, StoryboardEditor } from './editors'
import { canAdopt, parseBoard } from './state'
import type { Body, Stage } from './types'
import { useCreationWorkspace } from './useCreationWorkspace'

function Waiting() {
  return (
    <span aria-label="处理中" className="creation-wait" role="status">
      <i />
      <i />
      <i />
    </span>
  )
}

export function CreationPage() {
  const { id } = useParams()
  const account = useUserStore((user) => user.userId)
  const token = useUserStore((user) => user.token)
  if (!account || !token) return null
  return (
    <CreationSession
      account={account}
      key={`${account}:${token}:${id ?? 'new'}`}
      route={id ?? 'new'}
      token={token}
    />
  )
}

function CreationSession({
  account,
  token,
  route,
}: {
  account: number
  token: string
  route: string
}) {
  const workspace = useCreationWorkspace(account, token, route)
  const { draft, body, dirty, pending, busy, loading, models, model } = workspace
  const navigate = useNavigate()
  const [tab, setTab] = useState<Stage | 'BRIEF'>('BRIEF')
  const locked = busy || loading || !!pending || (route !== 'new' && !draft)
  const running =
    draft?.runs.some((run) => run.status === 'PENDING' || run.status === 'RUNNING') ?? false
  const staleEdit = !!draft && dirty && workspace.editRevision !== draft.revision
  const boardStale = body.boardScriptVersion !== body.scriptVersion
  const saved = !!draft && !dirty && !pending && !busy
  const ready = saved && body.scriptConfirmed && body.boardConfirmed && !boardStale
  const requestId = () => crypto.randomUUID()
  const changeBody = (patch: Partial<Body>) => workspace.edit({ ...body, ...patch })
  const save = () => {
    try {
      const storyboard = workspace.boardJson.trim() ? parseBoard(workspace.boardJson) : null
      if (!draft)
        void workspace.send({
          kind: 'create',
          payload: { requestId: requestId(), brief: body.brief },
        })
      else
        void workspace.send({
          kind: 'save',
          draftId: draft.id,
          payload: {
            revision: workspace.editRevision,
            brief: body.brief,
            script: body.script,
            storyboard,
          },
        })
    } catch (error) {
      workspace.setError(error instanceof Error ? error.message : '分镜 JSON 无效')
    }
  }
  const generate = (stage: Stage) => {
    if (!draft || !model || !models.some((entry) => entry.code === model)) return
    void workspace.send({
      kind: 'generate',
      draftId: draft.id,
      payload: { requestId: requestId(), revision: draft.revision, stage, model },
    })
  }
  const confirm = (stage: Stage) => {
    if (draft)
      void workspace.send({
        kind: 'confirm',
        draftId: draft.id,
        payload: { revision: draft.revision, stage },
      })
  }

  return (
    <div className="creation-page">
      <header className="creation-header">
        <div>
          <p className="creation-eyebrow">
            {BRANDING.competition} · {BRANDING.teamName}
          </p>
          <h1>文字创作工作台</h1>
          <p>简报 → 剧本 → 分镜 → 项目。生成先形成候选，由你采用、编辑并确认。</p>
        </div>
        <button disabled={busy} type="button" onClick={() => navigate('/creation')}>
          新建创作
        </button>
      </header>
      <div className="creation-layout">
        <aside className="creation-sidebar creation-card">
          <h2>我的创作</h2>
          {loading && <Waiting />}
          {!loading && workspace.drafts.length === 0 && (
            <p className="creation-hint">保存第一份简报后，可随时回来继续。</p>
          )}
          {workspace.drafts.map((item) => (
            <button
              aria-current={item.id === draft?.id ? 'page' : undefined}
              className="creation-draft-link"
              key={item.id}
              type="button"
              onClick={() => navigate(`/creation/${item.id}`)}
            >
              <strong>{item.title}</strong>
              <span>
                版本 {item.revision}
                {item.projectId ? ' · 已建项目' : ''}
              </span>
            </button>
          ))}
          <p className="creation-hint">已受理的生成在服务端继续执行，关闭页面不会取消任务。</p>
        </aside>
        <main className="creation-workspace">
          <div className="creation-card creation-toolbar">
            <label className="creation-field">
              <span>官方文字模型 · 当前启用目录</span>
              <select
                disabled={locked}
                value={model}
                onChange={(event) => workspace.setModel(event.target.value)}
              >
                {models.length === 0 && <option value="">暂无可用模型</option>}
                {models.map((entry) => (
                  <option key={entry.id} value={entry.code}>
                    {entry.name} · {entry.provider}
                  </option>
                ))}
              </select>
            </label>
            <div className="creation-actions">
              <button disabled={busy} type="button" onClick={() => window.location.reload()}>
                重新加载
              </button>
              <span className="creation-hint">
                {draft ? `草稿 #${draft.id} · 版本 ${draft.revision}` : '新创作'}
                {dirty ? ' · 有未保存编辑' : ''}
              </span>
              {busy && <Waiting />}
              <button disabled={locked || (draft !== null && !dirty)} type="button" onClick={save}>
                {draft ? '保存修改' : '保存简报'}
              </button>
            </div>
          </div>
          {workspace.error && (
            <div aria-live="polite" className="creation-notice">
              {workspace.error}
            </div>
          )}
          {workspace.storageError && (
            <div className="creation-notice" role="alert">
              {workspace.storageError}
            </div>
          )}
          {staleEdit && (
            <div className="creation-notice">
              服务端版本已变化。本机编辑基于版本 {workspace.editRevision}
              ，不会覆盖新版本；请复制所需内容后放弃本机编辑并重新读取。
            </div>
          )}
          {pending && !busy && (
            <div className="creation-notice">
              <strong>原请求待确认</strong>
              <p>
                已保留原始请求和输入。
                {pending.kind === 'generate' ||
                pending.kind === 'create' ||
                pending.kind === 'project'
                  ? `请求 ID：${pending.payload.requestId}`
                  : `操作：${pending.kind}`}
                。重试沿用原请求，不会自动创建新生成。
              </p>
              <button
                disabled={busy || loading}
                type="button"
                onClick={() => void workspace.send(pending)}
              >
                重试原请求
              </button>
              <details>
                <summary>查看原始请求</summary>
                <pre>{JSON.stringify(pending, null, 2)}</pre>
              </details>
            </div>
          )}
          {draft?.projectId && (
            <div className="creation-notice">
              <strong>已建立项目快照 #{draft.projectId}</strong>
              <p>项目保留建立时已确认的内容。之后编辑此创作不会自动同步到项目。</p>
              <button
                disabled={locked}
                type="button"
                onClick={() => navigate(`/editor/${draft.projectId}`)}
              >
                打开已建项目
              </button>
            </div>
          )}
          <div aria-label="创作阶段" className="creation-tabs" role="tablist">
            {(
              [
                ['BRIEF', '1 · 创作简报'],
                ['SCRIPT', `2 · 剧本${body.scriptConfirmed && !dirty ? ' ✓' : ''}`],
                ['STORYBOARD', `3 · 分镜${body.boardConfirmed && !dirty ? ' ✓' : ''}`],
              ] as const
            ).map(([key, label]) => (
              <button
                aria-selected={tab === key}
                disabled={!draft && key !== 'BRIEF'}
                key={key}
                role="tab"
                type="button"
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <section className="creation-card">
            <fieldset className="creation-editor" disabled={locked}>
              {tab === 'BRIEF' && (
                <>
                  <h2>创作简报</h2>
                  <BriefEditor brief={body.brief} onChange={(brief) => changeBody({ brief })} />
                </>
              )}
              {tab === 'SCRIPT' && (
                <div className="creation-stack">
                  <div className="creation-section-heading">
                    <h2>剧本编辑</h2>
                    <button
                      disabled={!saved || running || !model}
                      type="button"
                      onClick={() => generate('SCRIPT')}
                    >
                      生成剧本候选
                    </button>
                  </div>
                  <p className="creation-hint">
                    先保存简报，再生成候选。采用候选后仍可人工修改，保存并确认后才能生成分镜。
                  </p>
                  <label className="creation-field">
                    <span>剧本正文</span>
                    <textarea
                      maxLength={20000}
                      rows={20}
                      value={body.script}
                      onChange={(event) => changeBody({ script: event.target.value })}
                    />
                  </label>
                  <div className="creation-actions">
                    <button
                      disabled={!saved || !body.script.trim() || body.scriptConfirmed}
                      type="button"
                      onClick={() => confirm('SCRIPT')}
                    >
                      {body.scriptConfirmed && !dirty ? '剧本已确认' : '确认当前剧本'}
                    </button>
                    <span className="creation-hint">修改简报或剧本后需重新确认。</span>
                  </div>
                </div>
              )}
              {tab === 'STORYBOARD' && (
                <div className="creation-stack">
                  <div className="creation-section-heading">
                    <h2>分镜编辑</h2>
                    <button
                      disabled={!saved || !body.scriptConfirmed || running || !model}
                      type="button"
                      onClick={() => generate('STORYBOARD')}
                    >
                      生成分镜候选
                    </button>
                  </div>
                  <p className="creation-hint">
                    先确认剧本，再生成分镜。服务端校验资产引用、镜头数量及总时长后才允许确认。
                  </p>
                  {body.storyboard ? (
                    <StoryboardEditor
                      board={body.storyboard}
                      onChange={(storyboard) =>
                        workspace.edit({ ...body, storyboard }, JSON.stringify(storyboard, null, 2))
                      }
                    />
                  ) : (
                    <p className="creation-empty">
                      尚无分镜。生成并采用候选，或使用高级 JSON 填写。
                    </p>
                  )}
                  {body.storyboard && boardStale && (
                    <p className="creation-notice">
                      此分镜对应旧剧本。请基于当前已确认剧本重新生成，或修订分镜并保存后确认。
                    </p>
                  )}
                  <details>
                    <summary>高级分镜 JSON（完整字段可编辑）</summary>
                    <label className="creation-field">
                      <span>完整 JSON · 修改后保存；结构化编辑会覆盖此文本</span>
                      <textarea
                        className="creation-code"
                        rows={16}
                        value={workspace.boardJson}
                        onChange={(event) => workspace.edit(body, event.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          const storyboard = parseBoard(workspace.boardJson)
                          workspace.edit(
                            { ...body, storyboard },
                            JSON.stringify(storyboard, null, 2),
                          )
                        } catch (error) {
                          workspace.setError(error instanceof Error ? error.message : 'JSON 无效')
                        }
                      }}
                    >
                      应用到结构化编辑器
                    </button>
                  </details>
                  <button
                    type="button"
                    disabled={
                      !saved ||
                      !body.storyboard ||
                      !body.scriptConfirmed ||
                      boardStale ||
                      body.boardConfirmed
                    }
                    onClick={() => confirm('STORYBOARD')}
                  >
                    {body.boardConfirmed && !dirty ? '分镜已确认' : '确认当前分镜'}
                  </button>
                </div>
              )}
            </fieldset>
            {dirty && (
              <div className="creation-actions creation-editor-footer">
                <button disabled={locked} type="button" onClick={save}>
                  保存修改
                </button>
                <button disabled={locked} type="button" onClick={() => void workspace.discard()}>
                  放弃本机编辑并重新读取
                </button>
              </div>
            )}
          </section>
          {draft && (
            <section className="creation-card creation-stack">
              <div className="creation-section-heading">
                <h2>生成记录与候选</h2>
                {running && <Waiting />}
              </div>
              <p className="creation-hint">
                候选只对应生成时的版本。保存或确认使版本变化后，旧候选不可采用；原始输出始终可查看。
              </p>
              {draft.runs.length === 0 && <p className="creation-empty">暂无生成记录</p>}
              {draft.runs.map((run) => (
                <article className="creation-run" key={run.id}>
                  <div className="creation-section-heading">
                    <strong>
                      {run.stage === 'SCRIPT' ? '剧本' : '分镜'} #{run.id} · {run.status}
                    </strong>
                    {['PENDING', 'RUNNING'].includes(run.status) && <Waiting />}
                  </div>
                  <p className="creation-hint">
                    输入版本 {run.inputRevision} · {run.model} · 提示词 v{run.promptVersion} · 任务
                    #{run.jobId}
                    {run.applied
                      ? ' · 已采用'
                      : run.inputRevision !== draft.revision
                        ? ' · 已过期'
                        : ''}
                  </p>
                  {run.error && <p className="creation-notice">{run.error}</p>}
                  <details>
                    <summary>候选预览 / 原始输出</summary>
                    <pre>{run.output || '暂无输出；运行结束后在此查看。'}</pre>
                  </details>
                  <button
                    disabled={locked || !canAdopt(draft, run, dirty)}
                    type="button"
                    onClick={() =>
                      void workspace.send({
                        kind: 'adopt',
                        draftId: draft.id,
                        runId: run.id,
                        payload: { revision: draft.revision },
                      })
                    }
                  >
                    {run.applied
                      ? '已采用'
                      : run.inputRevision !== draft.revision
                        ? '过期候选不可采用'
                        : '采用此候选'}
                  </button>
                </article>
              ))}
            </section>
          )}
          <section className="creation-card creation-stack">
            <h2>建立项目与导出</h2>
            <p className="creation-hint">
              剧本与分镜均须保存、确认。建立项目会保存当前内容的独立快照。
            </p>
            <div className="creation-actions">
              <button
                className="creation-primary"
                disabled={!ready || !!draft?.projectId}
                type="button"
                onClick={() => {
                  if (draft)
                    void workspace.send({
                      kind: 'project',
                      draftId: draft.id,
                      payload: { requestId: requestId(), revision: draft.revision },
                    })
                }}
              >
                建立项目并进入编辑器
              </button>
              <button disabled={!ready} type="button" onClick={() => void workspace.download()}>
                下载分镜 Excel
              </button>
            </div>
          </section>
          <footer className="creation-hint">{BRANDING.disclaimer}</footer>
        </main>
      </div>
    </div>
  )
}
