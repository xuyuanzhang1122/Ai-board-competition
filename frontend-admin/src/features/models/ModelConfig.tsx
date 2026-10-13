import { Button, Input } from '@lobehub/ui'
import { App as AntdApp, Modal, Select, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useMemo, useState } from 'react'

import { adminApi } from '@/shared/api/admin'
import type { AiModel, ModelPayload } from '@/shared/api/types'
import { ModelProviderIcon } from '@/shared/components/ModelProviderIcon'

const TYPES = [
  { value: 'LANGUAGE', label: '语言模型' },
  { value: 'IMAGE', label: '图像模型' },
  { value: 'VIDEO', label: '视频模型' },
]

const TYPE_OPTIONS = [{ value: '', label: '全部类型' }, ...TYPES]

const typeLabel = (type: string) => TYPES.find((t) => t.value === type)?.label || type

const initialForm: ModelPayload = {
  code: '',
  description: '',
  enabled: 1,
  name: '',
  provider: '',
  sortOrder: 0,
  type: 'LANGUAGE',
}

export function ModelConfig() {
  const { message, modal } = AntdApp.useApp()

  const [models, setModels] = useState<AiModel[]>([])
  const [loading, setLoading] = useState(false)
  const [filterType, setFilterType] = useState('')

  const [modalVisible, setModalVisible] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<ModelPayload>({ ...initialForm })

  const load = async (type = filterType) => {
    setLoading(true)
    try {
      const data = await adminApi.listModels(type)
      setModels(data)
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType])

  const grouped = useMemo(() => {
    const map: Record<string, AiModel[]> = {}
    for (const m of models) {
      ;(map[m.type] ||= []).push(m)
    }
    return map
  }, [models])

  const openCreate = () => {
    setEditingId(null)
    setForm({ ...initialForm })
    setModalVisible(true)
  }

  const openEdit = (m: AiModel) => {
    setEditingId(m.id)
    setForm({
      code: m.code,
      description: m.description || '',
      enabled: m.enabled,
      name: m.name,
      provider: m.provider || '',
      sortOrder: m.sortOrder,
      type: m.type,
    })
    setModalVisible(true)
  }

  const submit = async () => {
    if (!form.code || !form.name) {
      message.error('编码和名称必填')
      return
    }
    setSubmitLoading(true)
    try {
      const payload: ModelPayload = {
        ...form,
        sortOrder: Number(form.sortOrder) || 0,
        enabled: Number(form.enabled),
      }
      if (editingId) {
        await adminApi.updateModel(editingId, payload)
        message.success('已更新')
      } else {
        await adminApi.createModel(payload)
        message.success('已新增')
      }
      setModalVisible(false)
      void load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSubmitLoading(false)
    }
  }

  const toggle = async (m: AiModel) => {
    try {
      await adminApi.toggleModel(m.id, m.enabled !== 1)
      message.success(m.enabled === 1 ? '已停用' : '已启用')
      void load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : '操作失败')
    }
  }

  const remove = (m: AiModel) => {
    modal.confirm({
      title: '删除模型',
      content: `确定删除模型「${m.name}」吗？`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await adminApi.deleteModel(m.id)
          message.success('已删除')
          void load()
        } catch (e) {
          message.error(e instanceof Error ? e.message : '删除失败')
        }
      },
    })
  }

  const columns: ColumnsType<AiModel> = [
    { title: '排序', dataIndex: 'sortOrder', key: 'sortOrder', width: 70 },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (value: string, record) => (
        <span className="flex items-center gap-2 font-medium">
          <ModelProviderIcon code={record.code} provider={record.provider} />
          {value}
        </span>
      ),
    },
    {
      title: '编码',
      dataIndex: 'code',
      key: 'code',
      render: (value: string) => (
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{value}</code>
      ),
    },
    {
      title: '供应商',
      dataIndex: 'provider',
      key: 'provider',
      render: (value: string | null) => value || '—',
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 90,
      render: (value: number) => (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            value === 1 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}
        >
          {value === 1 ? '启用' : '停用'}
        </span>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      render: (value: string | null) => (
        <span className="block max-w-[220px] truncate text-sm text-muted-foreground">
          {value || '—'}
        </span>
      ),
    },
    {
      title: '',
      key: 'action',
      width: 220,
      render: (_, record) => (
        <div className="flex items-center justify-end gap-2">
          <Button size="small" onClick={() => void toggle(record)}>
            {record.enabled === 1 ? '停用' : '启用'}
          </Button>
          <Button size="small" onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Button danger size="small" onClick={() => remove(record)}>
            删除
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <header className="mb-5 flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold">模型配置</h2>
          <p className="mt-1 text-sm text-muted-foreground">管理语言 / 图像 / 视频模型的启停与排序</p>
        </div>
        <Button type="primary" onClick={openCreate}>
          + 新增模型
        </Button>
      </header>

      <div className="mb-4">
        <Select
          options={TYPE_OPTIONS}
          style={{ maxWidth: 180, width: '100%' }}
          value={filterType}
          onChange={(value) => setFilterType(value as string)}
        />
      </div>

      {Object.keys(grouped).length === 0 && !loading && (
        <p className="py-10 text-center text-sm text-muted-foreground">暂无模型</p>
      )}

      {Object.entries(grouped).map(([type, list]) => (
        <div className="mb-6" key={type}>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">{typeLabel(type)}</h3>
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <Table
              columns={columns}
              dataSource={list}
              loading={loading}
              pagination={false}
              rowKey="id"
              scroll={{ x: 'max-content' }}
            />
          </div>
        </div>
      ))}

      <Modal
        confirmLoading={submitLoading}
        okText="保存"
        open={modalVisible}
        title={editingId ? '编辑模型' : '新增模型'}
        onCancel={() => setModalVisible(false)}
        onOk={() => void submit()}
      >
        <div className="flex flex-col gap-4 py-2">
          <label className="flex flex-col gap-1.5 text-sm">
            类型 *
            <Select
              options={TYPES}
              value={form.type}
              onChange={(value) => setForm((prev) => ({ ...prev, type: value as string }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            名称 *
            <Input
              placeholder="如 Gemini 3 Pro"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            编码 *
            <Input
              placeholder="如 gemini-3-pro-preview"
              value={form.code}
              onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            供应商
            <Input
              placeholder="可选"
              value={form.provider}
              onChange={(event) => setForm((prev) => ({ ...prev, provider: event.target.value }))}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              排序
              <Input
                type="number"
                value={String(form.sortOrder ?? 0)}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, sortOrder: Number(event.target.value) }))
                }
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              状态
              <Select
                value={form.enabled}
                options={[
                  { label: '启用', value: 1 },
                  { label: '停用', value: 0 },
                ]}
                onChange={(value) => setForm((prev) => ({ ...prev, enabled: value as number }))}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            描述
            <Input
              placeholder="可选"
              value={form.description}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, description: event.target.value }))
              }
            />
          </label>
        </div>
      </Modal>
    </div>
  )
}
