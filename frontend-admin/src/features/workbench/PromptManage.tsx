import { Button, Select, Table, Tag } from 'antd'
import { useEffect, useState } from 'react'

import type { Prompt, PromptFields } from '@/shared/api/workbench'

import { ErrorNotice, ReloadButton, SessionPage, TextField } from './common'
import { edit, failed, initialEditor, saved } from './editor'
import { canReplace, errorText, useWorkbench } from './useWorkbench'

const empty: PromptFields = {
  stage: 'BRAINSTORM',
  content: '',
  variables: '',
  capability: 'TEXT',
  changeNote: '',
}
const statuses = { DRAFT: '草稿', PUBLISHED: '已发布', DISABLED: '已停用' }
export function PromptManage() {
  return <SessionPage>{(token) => <PromptPage token={token} />}</SessionPage>
}
function PromptPage({ token }: { token: string }) {
  const { client, active } = useWorkbench(token)
  const [records, setRecords] = useState<Prompt[]>([])
  const [selected, setSelected] = useState<Prompt | null>(null)
  const [editor, setEditor] = useState(() => initialEditor({ ...empty }))
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  async function load() {
    setBusy(true)
    try {
      const rows = await client.listPrompts()
      if (active()) {
        setRecords(rows)
        setError('')
      }
    } catch (e) {
      if (active()) setError(errorText(e))
    } finally {
      if (active()) setBusy(false)
    }
  }
  useEffect(() => {
    void load()
  }, [client]) // eslint-disable-line react-hooks/exhaustive-deps
  function change<K extends keyof PromptFields>(key: K, value: PromptFields[K]) {
    setEditor((state) => edit(state, { ...state.value, [key]: value }))
  }
  async function create() {
    setBusy(true)
    try {
      const record = await client.createPrompt(editor.value)
      if (active()) {
        setSelected(record)
        setRecords((rows) => [record, ...rows])
        setEditor((state) => saved(state, { ...editor.value }))
        setNotice(`已创建 ${record.stage} v${record.version} 草稿。内容不可修改，可复制为新版本。`)
      }
    } catch (e) {
      if (active()) setEditor((state) => failed(state, errorText(e)))
    } finally {
      if (active()) setBusy(false)
    }
  }
  async function transition(record: Prompt, status: 'PUBLISHED' | 'DISABLED') {
    setBusy(true)
    try {
      await client.promptStatus(record.stage, record.version, status, record.publishedVersion)
      if (active()) {
        setSelected(null)
        setNotice(`${record.stage} v${record.version} ${statuses[status]}。`)
        await load()
      }
    } catch (e) {
      if (active()) setError(errorText(e))
    } finally {
      if (active()) setBusy(false)
    }
  }
  function copy(record: Prompt | null) {
    if (!canReplace(editor.dirty)) return
    setEditor(
      initialEditor(
        record
          ? {
              stage: record.stage,
              content: record.content,
              variables: record.variables,
              capability: record.capability,
              changeNote: '',
            }
          : { ...empty },
      ),
    )
  }
  const stages = [
    ...new Set(['BRAINSTORM', 'SCRIPT', 'STORYBOARD', ...records.map((row) => row.stage)]),
  ]
  return (
    <div>
      <h2 className="text-xl font-semibold">提示词版本管理</h2>
      <p className="my-2 text-sm text-muted-foreground">
        每次保存创建独立草稿版本，已有版本内容不可修改。发布按当前已发布版本检查并发；停用后相关能力需要重新发布提示词。
      </p>
      <div className="my-4 flex flex-wrap gap-2">
        <Select
          aria-label="筛选提示词阶段"
          style={{ minWidth: 200 }}
          value={filter}
          options={[
            { value: '', label: '全部阶段' },
            ...stages.map((value) => ({ value, label: value })),
          ]}
          onChange={setFilter}
        />
        <ReloadButton busy={busy} onClick={() => void load()} />
        <Button disabled={busy} onClick={() => copy(null)}>
          清空新草稿
        </Button>
      </div>
      {notice && (
        <p className="mb-3" role="status">
          {notice}
        </p>
      )}
      <ErrorNotice error={error} />
      <Table
        dataSource={records.filter((row) => !filter || row.stage === filter)}
        loading={busy}
        pagination={{ pageSize: 8 }}
        rowKey={(row) => `${row.stage}-${row.version}`}
        scroll={{ x: 'max-content' }}
        columns={[
          { title: '阶段', dataIndex: 'stage' },
          { title: '版本', dataIndex: 'version' },
          { title: '状态', render: (_, row) => <Tag>{statuses[row.status]}</Tag> },
          { title: '能力', dataIndex: 'capability' },
          { title: '变更说明', dataIndex: 'changeNote' },
          { title: '作者', dataIndex: 'authorId' },
          { title: '创建时间', dataIndex: 'createdAt' },
          { title: '当前发布版', dataIndex: 'publishedVersion' },
          {
            title: '操作',
            render: (_, row) => (
              <div className="flex gap-2">
                <Button disabled={busy} onClick={() => setSelected(row)}>
                  查看
                </Button>
                <Button disabled={busy} onClick={() => copy(row)}>
                  复制为新草稿
                </Button>
                {row.status === 'DRAFT' && (
                  <Button disabled={busy} onClick={() => void transition(row, 'PUBLISHED')}>
                    发布
                  </Button>
                )}
                {row.status !== 'DISABLED' && (
                  <Button danger disabled={busy} onClick={() => void transition(row, 'DISABLED')}>
                    停用
                  </Button>
                )}
              </div>
            ),
          },
        ]}
      />
      {selected && (
        <section className="mt-4 rounded-xl border border-border bg-background p-5">
          <h3 className="font-semibold">
            {selected.stage} v{selected.version} · {statuses[selected.status]}
          </h3>
          <p className="my-2 text-sm">
            作者：{selected.authorId} · 创建时间：{selected.createdAt} · 能力：{selected.capability}{' '}
            · 当前发布版：{selected.publishedVersion || '无'}
          </p>
          <p className="mb-2">变更：{selected.changeNote || '—'}</p>
          <p>变量：{selected.variables || '—'}</p>
          <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-3">
            {selected.content}
          </pre>
        </section>
      )}
      <section className="mt-6 rounded-xl border border-border bg-background p-5">
        <h3 className="mb-3 font-semibold">创建新草稿版本{editor.dirty && ' · 未保存'}</h3>
        <ErrorNotice error={editor.error} />
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void create()
          }}
        >
          <fieldset className="grid gap-4 md:grid-cols-2" disabled={busy}>
            <TextField
              required
              label="阶段（例如 BRAINSTORM / SCRIPT / STORYBOARD）"
              value={editor.value.stage}
              onChange={(value) => change('stage', value)}
            />
            <TextField
              required
              label="能力"
              value={editor.value.capability}
              onChange={(value) => change('capability', value)}
            />
            <div className="md:col-span-2">
              <TextField
                multiline
                required
                label="提示词内容"
                value={editor.value.content}
                onChange={(value) => change('content', value)}
              />
            </div>
            <TextField
              multiline
              label="变量声明"
              value={editor.value.variables}
              onChange={(value) => change('variables', value)}
            />
            <TextField
              multiline
              required
              label="变更说明"
              value={editor.value.changeNote}
              onChange={(value) => change('changeNote', value)}
            />
            <div>
              <Button htmlType="submit" loading={busy} type="primary">
                创建新草稿
              </Button>
            </div>
          </fieldset>
        </form>
      </section>
    </div>
  )
}
