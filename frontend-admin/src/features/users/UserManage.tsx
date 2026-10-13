import { Button, Input, InputPassword } from '@lobehub/ui'
import { App as AntdApp, Modal, Select, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useState } from 'react'

import { adminApi } from '@/shared/api/admin'
import type { CreateUserPayload, UserDetail, UserListItem } from '@/shared/api/types'

const PAGE_SIZE = 20

const STATUS_OPTIONS = [
  { label: '正常', value: 1 },
  { label: '禁用', value: 0 },
]

export function UserManage() {
  const { message, modal } = AntdApp.useApp()

  const [rows, setRows] = useState<UserListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [inputKeyword, setInputKeyword] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [loading, setLoading] = useState(false)

  const [createVisible, setCreateVisible] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [createForm, setCreateForm] = useState<CreateUserPayload>({
    username: '',
    password: '',
    nickname: '',
    initialBalance: 0,
  })

  const [detail, setDetail] = useState<UserDetail | null>(null)
  const [detailVisible, setDetailVisible] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [editLoading, setEditLoading] = useState(false)
  const [editNickname, setEditNickname] = useState('')
  const [editStatus, setEditStatus] = useState(1)

  const [pwdVisible, setPwdVisible] = useState(false)
  const [pwdLoading, setPwdLoading] = useState(false)
  const [pwdForm, setPwdForm] = useState({ username: '', password: '' })

  const [pointsVisible, setPointsVisible] = useState(false)
  const [pointsLoading, setPointsLoading] = useState(false)
  const [pointsForm, setPointsForm] = useState({ delta: 0, remark: '' })

  const load = async (targetPage = page, targetKeyword = searchKeyword) => {
    setLoading(true)
    try {
      const res = await adminApi.pageUsers(targetPage, PAGE_SIZE, targetKeyword)
      // 后端默认按 createdAt 降序；这里倒排为升序，让新创建的用户显示在老用户下面。
      const sorted = [...res.records].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )
      setRows(sorted)
      setTotal(res.total)
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchKeyword])

  const search = () => {
    setPage(1)
    setSearchKeyword(inputKeyword)
    void load(1, inputKeyword)
  }

  const changePage = (delta: number) => {
    const next = page + delta
    if (next < 1 || (next - 1) * PAGE_SIZE >= total) return
    setPage(next)
    void load(next, searchKeyword)
  }

  const openCreate = () => {
    setCreateForm({ username: '', password: '', nickname: '', initialBalance: 0 })
    setCreateVisible(true)
  }

  const submitCreate = async () => {
    if (!createForm.username || !createForm.password) {
      message.error('用户名和密码必填')
      return
    }
    setCreateLoading(true)
    try {
      await adminApi.createUser({
        username: createForm.username,
        password: createForm.password,
        nickname: createForm.nickname || undefined,
        initialBalance: Number(createForm.initialBalance) || 0,
      })
      message.success('用户已创建')
      setCreateVisible(false)
      setCreateForm({ username: '', password: '', nickname: '', initialBalance: 0 })
      search()
    } catch (e) {
      message.error(e instanceof Error ? e.message : '创建失败')
    } finally {
      setCreateLoading(false)
    }
  }

  const openDetail = async (id: number) => {
    setDetailLoading(true)
    try {
      const data = await adminApi.getUser(id)
      setDetail(data)
      setEditNickname(data.nickname || '')
      setEditStatus(data.status)
      setDetailVisible(true)
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载失败')
    } finally {
      setDetailLoading(false)
    }
  }

  const saveEdit = async () => {
    if (!detail) return
    setEditLoading(true)
    try {
      const updated = await adminApi.updateUser(detail.id, {
        nickname: editNickname,
        status: editStatus,
      })
      message.success('已保存')
      setDetail(updated)
      void load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setEditLoading(false)
    }
  }

  const openPwd = () => {
    if (!detail) return
    setPwdForm({ username: detail.username || '', password: '' })
    setPwdVisible(true)
  }

  const submitPwd = async () => {
    if (!detail || !pwdForm.password) {
      message.error('请输入新密码')
      return
    }
    setPwdLoading(true)
    try {
      await adminApi.setPassword(detail.id, {
        username: pwdForm.username || undefined,
        password: pwdForm.password,
      })
      message.success('密码已更新')
      setPwdVisible(false)
      void openDetail(detail.id)
      void load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : '设置失败')
    } finally {
      setPwdLoading(false)
    }
  }

  const openPoints = () => {
    setPointsForm({ delta: 0, remark: '' })
    setPointsVisible(true)
  }

  const submitPoints = async () => {
    if (!detail || !pointsForm.delta) {
      message.error('请输入调整值')
      return
    }
    setPointsLoading(true)
    try {
      const updated = await adminApi.adjustPoints(
        detail.id,
        Number(pointsForm.delta),
        pointsForm.remark,
      )
      message.success('积分已调整')
      setPointsVisible(false)
      setDetail(updated)
      void load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : '调整失败')
    } finally {
      setPointsLoading(false)
    }
  }

  const removeUser = () => {
    if (!detail) return
    const u = detail
    modal.confirm({
      title: '删除用户',
      content: `确定删除用户「${u.nickname || u.username || u.id}」吗？该用户的项目、素材、钱包等关联数据将一并删除，且不可恢复。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await adminApi.deleteUser(u.id)
          message.success('用户已删除')
          setDetailVisible(false)
          setDetail(null)
          void load()
        } catch (e) {
          message.error(e instanceof Error ? e.message : '删除失败')
        }
      },
    })
  }

  const columns: ColumnsType<UserListItem> = [
    { title: 'ID', dataIndex: 'id', key: 'id' },
    {
      title: '昵称',
      dataIndex: 'nickname',
      key: 'nickname',
      render: (value: string | null) => value || '—',
    },
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      render: (value: string | null) => value || '—',
    },
    {
      title: '手机号',
      dataIndex: 'phone',
      key: 'phone',
      render: (value: string | null) => value || '—',
    },
    { title: '积分', dataIndex: 'balance', key: 'balance' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (value: number) => (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            value === 1
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-700'
          }`}
        >
          {value === 1 ? '正常' : '禁用'}
        </span>
      ),
    },
    {
      title: '注册时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (value: string) => (value || '').replace('T', ' ').slice(0, 16),
    },
    {
      title: '',
      key: 'action',
      render: (_, record) => (
        <Button size="small" onClick={() => void openDetail(record.id)}>
          管理
        </Button>
      ),
    },
  ]

  return (
    <div>
      <header className="mb-5 flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold">用户管理</h2>
          <p className="mt-1 text-sm text-muted-foreground">共 {total} 个用户</p>
        </div>
        <Button type="primary" onClick={openCreate}>
          + 新建用户
        </Button>
      </header>

      <div className="mb-4 flex items-center gap-3">
        <Input
          placeholder="搜索昵称 / 用户名 / 手机号"
          style={{ maxWidth: 280 }}
          value={inputKeyword}
          onChange={(event) => setInputKeyword(event.target.value)}
          onPressEnter={search}
        />
        <Button onClick={search}>搜索</Button>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <Table
          columns={columns}
          dataSource={rows}
          loading={loading}
          pagination={false}
          rowKey="id"
          scroll={{ x: 'max-content' }}
        />
        {!loading && rows.length === 0 && (
          <div className="py-10 text-center text-sm text-muted-foreground">暂无用户</div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-end gap-3 text-sm text-muted-foreground">
        <Button disabled={page === 1} size="small" onClick={() => changePage(-1)}>
          上一页
        </Button>
        <span>第 {page} 页</span>
        <Button disabled={page * PAGE_SIZE >= total} size="small" onClick={() => changePage(1)}>
          下一页
        </Button>
      </div>

      <Modal
        confirmLoading={createLoading}
        okText="创建"
        open={createVisible}
        title="新建用户"
        onCancel={() => setCreateVisible(false)}
        onOk={() => void submitCreate()}
      >
        <div className="flex flex-col gap-4 py-2">
          <label className="flex flex-col gap-1.5 text-sm">
            用户名 *
            <Input
              placeholder="登录用户名"
              value={createForm.username}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, username: event.target.value }))
              }
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            密码 *
            <InputPassword
              placeholder="初始密码（≥6位）"
              value={createForm.password}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, password: event.target.value }))
              }
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            昵称
            <Input
              placeholder="可选，默认同用户名"
              value={createForm.nickname}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, nickname: event.target.value }))
              }
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            初始积分
            <Input
              type="number"
              value={String(createForm.initialBalance ?? 0)}
              onChange={(event) =>
                setCreateForm((prev) => ({
                  ...prev,
                  initialBalance: Number(event.target.value),
                }))
              }
            />
          </label>
        </div>
      </Modal>

      <Modal
        confirmLoading={detailLoading || editLoading}
        open={detailVisible}
        title={detail ? `用户 #${detail.id}` : '用户详情'}
        width={560}
        footer={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button size="small" onClick={openPwd}>
                设置密码
              </Button>
              <Button size="small" onClick={openPoints}>
                调整积分
              </Button>
              <Button danger size="small" onClick={removeUser}>
                删除用户
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => setDetailVisible(false)}>关闭</Button>
              <Button loading={editLoading} type="primary" onClick={() => void saveEdit()}>
                保存
              </Button>
            </div>
          </div>
        }
        onCancel={() => setDetailVisible(false)}
      >
        {detail && (
          <div className="flex flex-col gap-5 py-2">
            <div className="grid grid-cols-4 gap-3">
              <div className="rounded-lg bg-muted/50 py-3 text-center text-xs text-muted-foreground">
                <span className="mb-0.5 block text-lg font-semibold text-foreground">
                  {detail.summary.projectCount}
                </span>
                项目
              </div>
              <div className="rounded-lg bg-muted/50 py-3 text-center text-xs text-muted-foreground">
                <span className="mb-0.5 block text-lg font-semibold text-foreground">
                  {detail.summary.orderCount}
                </span>
                订单
              </div>
              <div className="rounded-lg bg-muted/50 py-3 text-center text-xs text-muted-foreground">
                <span className="mb-0.5 block text-lg font-semibold text-foreground">
                  {detail.summary.jobCount}
                </span>
                任务
              </div>
              <div className="rounded-lg bg-muted/50 py-3 text-center text-xs text-muted-foreground">
                <span className="mb-0.5 block text-lg font-semibold text-foreground">
                  {detail.summary.assetCount}
                </span>
                资产
              </div>
            </div>

            <div className="flex flex-wrap gap-6 text-sm">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">用户名</span>
                <strong className="font-medium">{detail.username || '未设置'}</strong>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">手机号</span>
                <strong className="font-medium">{detail.phone || '—'}</strong>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">积分</span>
                <strong className="font-medium">{detail.balance}</strong>
              </div>
            </div>

            <label className="flex flex-col gap-1.5 text-sm">
              昵称
              <Input
                value={editNickname}
                onChange={(event) => setEditNickname(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              状态
              <Select
                options={STATUS_OPTIONS}
                style={{ width: '100%' }}
                value={editStatus}
                onChange={(value) => setEditStatus(value as number)}
              />
            </label>
          </div>
        )}
      </Modal>

      <Modal
        confirmLoading={pwdLoading}
        okText="确定"
        open={pwdVisible}
        title="设置 / 重置密码"
        onCancel={() => setPwdVisible(false)}
        onOk={() => void submitPwd()}
      >
        <div className="flex flex-col gap-4 py-2">
          <label className="flex flex-col gap-1.5 text-sm">
            用户名
            <Input
              placeholder="可改登录用户名"
              value={pwdForm.username}
              onChange={(event) =>
                setPwdForm((prev) => ({ ...prev, username: event.target.value }))
              }
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            新密码 *
            <InputPassword
              placeholder="≥6位"
              value={pwdForm.password}
              onChange={(event) =>
                setPwdForm((prev) => ({ ...prev, password: event.target.value }))
              }
            />
          </label>
        </div>
      </Modal>

      <Modal
        confirmLoading={pointsLoading}
        okText="确定"
        open={pointsVisible}
        title="调整积分"
        onCancel={() => setPointsVisible(false)}
        onOk={() => void submitPoints()}
      >
        <div className="flex flex-col gap-4 py-2">
          <p className="text-xs text-muted-foreground">
            正数增加，负数扣减；调整后不可为负。
          </p>
          <label className="flex flex-col gap-1.5 text-sm">
            调整值 *
            <Input
              placeholder="如 100 或 -50"
              type="number"
              value={String(pointsForm.delta)}
              onChange={(event) =>
                setPointsForm((prev) => ({ ...prev, delta: Number(event.target.value) }))
              }
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            备注
            <Input
              placeholder="可选"
              value={pointsForm.remark}
              onChange={(event) =>
                setPointsForm((prev) => ({ ...prev, remark: event.target.value }))
              }
            />
          </label>
        </div>
      </Modal>
    </div>
  )
}
