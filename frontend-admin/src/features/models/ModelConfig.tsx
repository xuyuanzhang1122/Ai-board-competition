import { Button } from '@lobehub/ui'
import { App as AntdApp, Select, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { adminApi } from '@/shared/api/admin'
import type { AiModel } from '@/shared/api/types'
import { ModelProviderIcon } from '@/shared/components/ModelProviderIcon'

const TYPES = [
  { value: 'LANGUAGE', label: '文字模型' },
  { value: 'IMAGE', label: '图像模型' },
  { value: 'VIDEO', label: '视频模型' },
  { value: 'AUDIO', label: '语音模型（尚未接入）' },
  { value: 'OTHER', label: '其他模型（尚未接入）' },
]

export function ModelConfig() {
  const { message } = AntdApp.useApp()
  const [models, setModels] = useState<AiModel[]>([])
  const [loading, setLoading] = useState(false)
  const [filterType, setFilterType] = useState('')
  const [error, setError] = useState('')
  const load = useCallback(async (force = false) => {
    setLoading(true)
    setError('')
    try {
      setModels(force ? await adminApi.syncModels() : await adminApi.listModels())
    } catch (e) {
      setModels([])
      setError(e instanceof Error ? e.message : '上游模型目录暂不可用')
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  const grouped = useMemo(() => {
    const groups: Record<string, AiModel[]> = {}
    for (const model of models) {
      if (!filterType || filterType === model.type) (groups[model.type] ||= []).push(model)
    }
    return groups
  }, [models, filterType])
  const toggle = async (model: AiModel) => {
    try {
      await adminApi.toggleModel(model.id, model.enabled !== 1)
      await load()
    } catch (e) { message.error(e instanceof Error ? e.message : '模型状态修改失败') }
  }
  const columns: ColumnsType<AiModel> = [
    { title: '上游名称', dataIndex: 'name', key: 'name' },
    { title: '原始模型 ID', dataIndex: 'code', key: 'code' },
    { title: '供应商', dataIndex: 'provider', key: 'provider', render: (provider: string) => <span className="flex items-center gap-2"><ModelProviderIcon provider={provider} />{provider}</span> },
    { title: '当前能力', key: 'status', render: (_, model) => model.type !== 'LANGUAGE' ? '尚未接入，不能调用' : model.enabled === 1 ? '启用' : '停用' },
    { title: '说明', dataIndex: 'description', key: 'description' },
    { title: '操作', key: 'action', render: (_, model) => model.type === 'LANGUAGE' ? <Button disabled={loading} size="small" onClick={() => void toggle(model)}>{model.enabled === 1 ? '停用' : '启用'}</Button> : '—' },
  ]
  return <div>
    <header className="mb-5 flex items-start justify-between gap-4">
      <div><h2 className="text-xl font-semibold">官方模型目录</h2><p className="mt-1 text-sm text-muted-foreground">由供应商 /models 接口同步，保留原始 ID；文字生成不限测试金额，图片、视频、语音尚未接入。</p></div>
      <Button loading={loading} type="primary" onClick={() => void load(true)}>同步上游模型</Button>
    </header>
    <Select className="mb-4" options={[{ value: '', label: `全部类型（${models.length}）` }, ...TYPES]} style={{ width: 220 }} value={filterType} onChange={setFilterType} />
    {error && <p className="py-4 text-red-600" role="alert">{error}。未使用旧目录或默认模型。</p>}
    {!error && !loading && Object.keys(grouped).length === 0 && <p className="py-6">上游没有返回当前类型的模型。</p>}
    {Object.entries(grouped).map(([type, list]) => <section className="mb-6" key={type}>
      <h3 className="mb-2 font-medium">{TYPES.find(item => item.value === type)?.label ?? type} · {list.length}</h3>
      <Table columns={columns} dataSource={list} loading={loading} pagination={false} rowKey="id" scroll={{ x: 'max-content' }} />
    </section>)}
  </div>
}
