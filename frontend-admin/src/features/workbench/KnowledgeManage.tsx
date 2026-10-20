import { Button, Select, Table, Tag } from 'antd'
import { useEffect, useState } from 'react'

import type { Knowledge, KnowledgeFields } from '@/shared/api/workbench'

import { ErrorNotice, Field, ReloadButton, SessionPage, TextField } from './common'
import { edit, failed, initialEditor, saved } from './editor'
import { canReplace, errorText, useWorkbench } from './useWorkbench'

const empty: KnowledgeFields = {
  title: '',
  content: '',
  sourceUrl: '',
  sourceOrganization: '',
  publishedOn: null,
  summary: '',
  factType: 'FACT',
  topics: '',
  license: '',
  validUntil: null,
}
const statuses = { DRAFT: '待审核', APPROVED: '已通过', REJECTED: '已驳回' }
export function KnowledgeManage() {
  return <SessionPage>{(token) => <KnowledgePage token={token} />}</SessionPage>
}
function KnowledgePage({ token }: { token: string }) {
  const { client, active } = useWorkbench(token)
  const [records, setRecords] = useState<Knowledge[]>([])
  const [editor, setEditor] = useState(() => initialEditor<KnowledgeFields>({ ...empty }))
  const [selected, setSelected] = useState<Knowledge | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  async function load(search = query) {
    setBusy(true)
    try {
      const rows = await client.listKnowledge(search)
      if (active()) {
        setRecords(rows)
        setNotice('')
      }
    } catch (e) {
      if (active()) setNotice(errorText(e))
    } finally {
      if (active()) setBusy(false)
    }
  }
  useEffect(() => {
    void load('')
  }, [client]) // eslint-disable-line react-hooks/exhaustive-deps
  function open(record: Knowledge | null) {
    if (!canReplace(editor.dirty || reviewNote !== (selected?.reviewNote ?? ''))) return
    setSelected(record)
    setEditor(initialEditor(record ? { ...record } : { ...empty }))
    setReviewNote(record?.reviewNote ?? '')
  }
  function change<K extends keyof KnowledgeFields>(key: K, value: KnowledgeFields[K]) {
    setEditor((state) => edit(state, { ...state.value, [key]: value }))
  }
  async function save() {
    setBusy(true)
    try {
      const fields: KnowledgeFields = Object.fromEntries(
        Object.keys(empty).map((key) => [key, editor.value[key as keyof KnowledgeFields]]),
      ) as unknown as KnowledgeFields
      const record = selected
        ? await client.updateKnowledge(selected.id, { ...fields, revision: selected.revision })
        : await client.createKnowledge(fields)
      if (active()) {
        setSelected(record)
        setEditor((state) => saved(state, record))
        setReviewNote(record.reviewNote ?? '')
        setRecords((rows) => [record, ...rows.filter((row) => row.id !== record.id)])
        setNotice('资料已保存；编辑后的资料需要重新审核。')
      }
    } catch (e) {
      if (active()) setEditor((state) => failed(state, errorText(e)))
    } finally {
      if (active()) setBusy(false)
    }
  }
  async function review(status: 'APPROVED' | 'REJECTED') {
    if (!selected || editor.dirty) return
    setBusy(true)
    try {
      const record = await client.reviewKnowledge(
        selected.id,
        selected.revision,
        status,
        reviewNote,
      )
      if (active()) {
        setSelected(record)
        setEditor((state) => saved(state, record))
        setReviewNote(record.reviewNote ?? '')
        setRecords((rows) => rows.map((row) => (row.id === record.id ? record : row)))
        setNotice('审核已保存。')
      }
    } catch (e) {
      if (active()) setEditor((state) => failed(state, errorText(e)))
    } finally {
      if (active()) setBusy(false)
    }
  }
  return (
    <div>
      <h2 className="text-xl font-semibold">知识资料与审核</h2>
      <p className="my-2 text-sm text-muted-foreground">
        仅已审核且未过期的资料可用于事实检索。来源链接不等于事实核实；传说、演绎及授权说明分别记录。
      </p>
      <div className="my-4 flex flex-wrap gap-2">
        <input
          aria-label="搜索知识"
          className="rounded border p-2"
          maxLength={200}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button disabled={busy} onClick={() => void load()}>
          搜索
        </Button>
        <ReloadButton busy={busy} onClick={() => void load()} />
        <Button disabled={busy} onClick={() => open(null)}>
          新增资料
        </Button>
      </div>
      {notice && (
        <p className="my-3" role="status">
          {notice}
        </p>
      )}
      <Table
        dataSource={records}
        loading={busy}
        pagination={{ pageSize: 8 }}
        rowKey="id"
        scroll={{ x: 'max-content' }}
        columns={[
          { title: '标题', dataIndex: 'title' },
          { title: '类型', dataIndex: 'factType' },
          { title: '状态', render: (_, row) => <Tag>{statuses[row.status]}</Tag> },
          { title: '修订', dataIndex: 'revision' },
          { title: '有效截止', dataIndex: 'validUntil' },
          {
            title: '操作',
            render: (_, row) => (
              <Button disabled={busy} onClick={() => open(row)}>
                编辑 / 审核
              </Button>
            ),
          },
        ]}
      />
      <section className="mt-6 rounded-xl border border-border bg-background p-5">
        <h3 className="mb-3 font-semibold">
          {selected
            ? `${selected.title} · 修订 ${selected.revision} · ${statuses[selected.status]}`
            : '新增资料'}
          {editor.dirty && ' · 未保存'}
        </h3>
        <ErrorNotice error={editor.error} />
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <fieldset className="grid gap-4 md:grid-cols-2" disabled={busy}>
            <TextField
              required
              label="标题"
              value={editor.value.title}
              onChange={(value) => change('title', value)}
            />
            <Field label="事实类型">
              <Select
                aria-label="事实类型"
                disabled={busy}
                value={editor.value.factType}
                options={[
                  { value: 'FACT', label: '事实' },
                  { value: 'LEGEND', label: '传说' },
                  { value: 'FICTION', label: '演绎' },
                ]}
                onChange={(value) => change('factType', value)}
              />
            </Field>
            <TextField
              multiline
              required
              label="正文"
              value={editor.value.content}
              onChange={(value) => change('content', value)}
            />
            <TextField
              multiline
              label="摘要"
              value={editor.value.summary}
              onChange={(value) => change('summary', value)}
            />
            <TextField
              label="来源 URL"
              value={editor.value.sourceUrl}
              onChange={(value) => change('sourceUrl', value)}
            />
            <TextField
              label="来源机构"
              value={editor.value.sourceOrganization}
              onChange={(value) => change('sourceOrganization', value)}
            />
            <TextField
              label="发布日期"
              type="date"
              value={editor.value.publishedOn ?? ''}
              onChange={(value) => change('publishedOn', value || null)}
            />
            <Field label="采集时间（自动记录）">
              <p>{selected?.collectedAt ?? '保存后自动记录'}</p>
            </Field>
            <TextField
              label="有效截止日期"
              type="date"
              value={editor.value.validUntil ?? ''}
              onChange={(value) => change('validUntil', value || null)}
            />
            <TextField
              label="主题标签"
              value={editor.value.topics}
              onChange={(value) => change('topics', value)}
            />
            <TextField
              multiline
              label="授权说明"
              value={editor.value.license}
              onChange={(value) => change('license', value)}
            />
            <div className="self-end">
              <Button htmlType="submit" loading={busy} type="primary">
                保存待审核资料
              </Button>
            </div>
          </fieldset>
        </form>
        {selected && (
          <div className="mt-5 border-t border-border pt-4">
            <p className="mb-3 text-sm">
              审核人：{selected.reviewedBy ?? '—'} · 审核时间：{selected.reviewedAt ?? '—'}
              。请先保存正文修改，再审核。
            </p>
            <TextField
              multiline
              disabled={busy}
              label="审核意见"
              value={reviewNote}
              onChange={setReviewNote}
            />
            <div className="mt-3 flex gap-2">
              <Button
                disabled={busy || editor.dirty || !reviewNote.trim()}
                onClick={() => void review('APPROVED')}
              >
                审核通过
              </Button>
              <Button
                danger
                disabled={busy || editor.dirty || !reviewNote.trim()}
                onClick={() => void review('REJECTED')}
              >
                驳回
              </Button>
              <Button
                disabled={busy}
                onClick={() => open(records.find((row) => row.id === selected.id) ?? selected)}
              >
                重新载入所选资料
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
