import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Loader2, Play, RefreshCw, Square } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  filterMihomoNodes,
  selectedMihomoNodes,
  type MihomoStatus,
  type MihomoSource,
} from './mihomo-model'
import { useRefreshProxies } from './queries'

type Action = {
  action: string
  id?: string
  ids?: string[]
  label?: string
  url?: string
  text?: string
  mode?: string
}
const selectStyle = 'bg-background h-9 rounded-md border px-2 text-sm'

export function MihomoPanel() {
  const query = useQuery({
    queryKey: ['panel', 'mihomo'],
    queryFn: () => api<MihomoStatus>('/api/panel/mihomo'),
    refetchInterval: 5000,
  })
  const refreshProxies = useRefreshProxies()
  const [filters, setFilters] = useState({
    search: '',
    source: '',
    state: '',
    country: '',
  })
  const [selected, setSelected] = useState<string[]>([])
  const [page, setPage] = useState(0)
  const [kind, setKind] = useState('subscription')
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [editing, setEditing] = useState<MihomoSource | null>(null)
  const [confirm, setConfirm] = useState<{
    body: Action
    message: string
  } | null>(null)
  const operation = useMutation({
    mutationFn: async (body: Action) => {
      if (body.ids?.length && ['test', 'quality'].includes(body.action)) {
        let failed = 0
        for (const id of body.ids) {
          try {
            await api('/api/panel/mihomo', {
              method: 'POST',
              body: JSON.stringify({ action: body.action, id }),
            })
          } catch {
            failed++
          }
        }
        if (failed)
          throw new Error(`${failed} 个节点未能完成检测，其余结果已保存`)
      } else {
        const targets = body.ids
        if (targets?.length) {
          for (let i = 0; i < targets.length; i += 100)
            await api('/api/panel/mihomo', {
              method: 'POST',
              body: JSON.stringify({ ...body, ids: targets.slice(i, i + 100) }),
            })
        } else
          await api('/api/panel/mihomo', {
            method: 'POST',
            body: JSON.stringify(body),
          })
      }
    },
    onSuccess: (_data, body) => {
      toast.success(
        ['test', 'quality'].includes(body.action)
          ? '检测已完成，请查看各节点结果'
          : '操作已应用'
      )
      setConfirm(null)
      if (
        [
          'source_add',
          'source_update',
          'source_rename',
          'dynamic_add',
        ].includes(body.action)
      ) {
        setContent('')
        setName('')
        setEditing(null)
      }
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: async () => {
      await Promise.all([query.refetch(), refreshProxies()])
    },
  })
  const status = query.data
  const busy = operation.isPending || !!status?.busy
  const rows = filterMihomoNodes(status?.nodes || [], filters)
  const targets = selectedMihomoNodes(rows, selected)
  const countries = [
    ...new Set(
      (status?.nodes || [])
        .map((n) => n.check?.geo?.country_code)
        .filter((c): c is string => !!c)
    ),
  ].sort()
  const lastPage = Math.max(0, Math.ceil(rows.length / 50) - 1)
  const currentPage = Math.min(page, lastPage)
  const visible = rows.slice(currentPage * 50, currentPage * 50 + 50)
  const changeFilter = (key: keyof typeof filters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }))
    setPage(0)
  }
  const ask = (body: Action, message: string) => setConfirm({ body, message })
  const editSource = (source: MihomoSource) => {
    setEditing(source)
    setName(source.label)
    setContent('')
    setKind(source.kind)
  }
  const submitSource = () => {
    const action = editing
      ? content.trim()
        ? 'source_update'
        : 'source_rename'
      : kind === 'dynamic'
        ? 'dynamic_add'
        : 'source_add'
    operation.mutate({
      action,
      id: editing?.id,
      label: name,
      ...(kind === 'dynamic' ? { text: content } : { url: content }),
    })
  }

  return (
    <section
      className='space-y-5 rounded-xl border p-4 sm:p-6'
      aria-label='Mihomo 管理'
    >
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h2 className='text-lg font-semibold'>Mihomo 订阅与节点</h2>
          <p className='mt-1 text-sm text-muted-foreground'>
            独立节点出口，接入现有代理池；不自动换节点或回退直连。
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='text-sm' role='status'>
            {status?.running
              ? '内核运行中'
              : status?.installed
                ? '内核已停止'
                : '尚未安装内核'}
          </span>
          <Button
            size='sm'
            variant='outline'
            disabled={busy || !!status?.running}
            onClick={() => operation.mutate({ action: 'install' })}
          >
            安装 {status?.version || '内核'}
          </Button>
          {status?.running ? (
            <Button
              size='sm'
              variant='outline'
              disabled={busy}
              onClick={() =>
                ask(
                  { action: 'stop' },
                  '停止内核会中断所有 Mihomo 出口；现有绑定会保留，不会切换为直连。'
                )
              }
            >
              <Square aria-hidden='true' />
              停止
            </Button>
          ) : (
            <Button
              size='sm'
              disabled={busy || !status?.installed}
              onClick={() => operation.mutate({ action: 'start' })}
            >
              <Play aria-hidden='true' />
              启动
            </Button>
          )}
          <Button
            size='icon'
            variant='ghost'
            aria-label='刷新 Mihomo 状态'
            onClick={() => void query.refetch()}
          >
            <RefreshCw aria-hidden='true' />
          </Button>
        </div>
      </div>
      {query.error && (
        <p role='alert' className='text-sm text-destructive'>
          {query.error.message}
        </p>
      )}
      {status?.error && (
        <p role='alert' className='text-sm text-destructive'>
          {status.error}
        </p>
      )}
      {busy && (
        <p role='status' className='flex items-center gap-2 text-sm'>
          <Loader2
            className='size-4 animate-spin motion-reduce:animate-none'
            aria-hidden='true'
          />
          正在处理；操作完成前不会显示成功。
        </p>
      )}
      <div className='grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]'>
        <div className='space-y-3'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <h3 className='font-medium'>订阅与动态代理来源</h3>
            <label className='flex items-center gap-2 text-sm'>
              订阅下载
              <select
                className={selectStyle}
                value={status?.download_mode || 'auto'}
                disabled={busy || !status}
                onChange={(e) =>
                  operation.mutate({
                    action: 'download_mode',
                    mode: e.target.value,
                  })
                }
              >
                <option value='auto'>自动：代理失败后直连</option>
                <option value='proxy'>仅代理，不回退直连</option>
                <option value='direct'>仅直连</option>
              </select>
            </label>
          </div>
          <p className='text-xs text-muted-foreground'>
            下载模式仅影响订阅获取，不影响账号请求；自动模式的直连回退可能向订阅提供方暴露服务器
            IP。
          </p>
          {!status?.sources.length && (
            <p className='rounded-md border border-dashed p-5 text-sm text-muted-foreground'>
              安装内核后添加 Clash/Mihomo YAML 订阅，或导入 HTTP(S)/SOCKS5
              动态代理。
            </p>
          )}
          {status?.sources.map((s) => (
            <div
              key={s.id}
              className='flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3'
            >
              <div className='min-w-0'>
                <p className='text-sm font-medium break-all'>{s.label}</p>
                <p className='text-xs text-muted-foreground'>
                  {s.kind === 'dynamic' ? '动态代理' : '订阅'} · {s.nodes}{' '}
                  个节点 · {s.enabled ? '已启用' : '已停用'}
                </p>
              </div>
              <div className='flex flex-wrap gap-1'>
                <Button
                  size='sm'
                  variant='ghost'
                  disabled={busy}
                  onClick={() => editSource(s)}
                >
                  编辑
                </Button>
                {s.kind === 'subscription' && (
                  <Button
                    size='sm'
                    variant='ghost'
                    disabled={busy}
                    onClick={() =>
                      operation.mutate({ action: 'source_refresh', id: s.id })
                    }
                  >
                    刷新
                  </Button>
                )}
                <Button
                  size='sm'
                  variant='ghost'
                  disabled={busy}
                  onClick={() =>
                    s.enabled
                      ? ask(
                          { action: 'source_disable', id: s.id },
                          '停用该来源的专属节点会拒绝已有绑定的流量；其他来源共有的节点保留。'
                        )
                      : operation.mutate({ action: 'source_enable', id: s.id })
                  }
                >
                  {s.enabled ? '停用' : '启用'}
                </Button>
                <Button
                  size='sm'
                  variant='ghost'
                  disabled={busy}
                  onClick={() =>
                    ask(
                      { action: 'source_remove', id: s.id },
                      '删除此来源及其专属节点？旧代理端口不会改指其他节点；其他来源不受影响。'
                    )
                  }
                >
                  删除
                </Button>
              </div>
            </div>
          ))}
        </div>
        <form
          className='space-y-3 rounded-lg border p-4'
          onSubmit={(e) => {
            e.preventDefault()
            submitSource()
          }}
        >
          <h3 className='font-medium'>{editing ? '编辑来源' : '添加来源'}</h3>
          {!editing && (
            <select
              aria-label='来源类型'
              className={`${selectStyle} w-full`}
              value={kind}
              onChange={(e) => {
                setKind(e.target.value)
                setContent('')
              }}
            >
              <option value='subscription'>Clash/Mihomo 订阅</option>
              <option value='dynamic'>HTTP(S)/SOCKS5 动态代理</option>
            </select>
          )}
          <label className='block space-y-1 text-sm'>
            <span>名称</span>
            <Input
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              placeholder='例如：主用订阅'
            />
          </label>
          {(!editing || kind === 'subscription') && (
            <label className='block space-y-1 text-sm'>
              <span>
                {kind === 'subscription' ? '订阅地址' : '代理地址，每行一个'}
              </span>
              {kind === 'subscription' ? (
                <Input
                  type='password'
                  autoComplete='off'
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={editing ? '留空仅修改名称' : 'https://…'}
                />
              ) : (
                <Textarea
                  autoComplete='off'
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder='socks5://用户:密码@主机:端口#名称'
                />
              )}
            </label>
          )}
          <p className='text-xs text-muted-foreground'>
            地址和凭据不在列表回显；动态代理固定供应商配置，不保证公网 IP 不变。
          </p>
          <div className='flex gap-2'>
            <Button
              type='submit'
              disabled={
                busy || !status?.installed || (!editing && !content.trim())
              }
            >
              {editing ? '保存' : '添加'}
            </Button>
            {editing && (
              <Button
                type='button'
                variant='ghost'
                onClick={() => {
                  setEditing(null)
                  setName('')
                  setContent('')
                }}
              >
                取消
              </Button>
            )}
          </div>
        </form>
      </div>
      <div className='space-y-3 border-t pt-5'>
        <h3 className='font-medium'>
          节点{' '}
          <span className='text-sm font-normal text-muted-foreground'>
            {rows.length} 个，已选择当前筛选内 {targets.length} 个
          </span>
        </h3>
        <div className='flex flex-wrap gap-2'>
          <Input
            className='w-full sm:w-60'
            aria-label='搜索节点'
            placeholder='搜索节点名称'
            value={filters.search}
            onChange={(e) => changeFilter('search', e.target.value)}
          />
          <select
            className={selectStyle}
            aria-label='按来源筛选'
            value={filters.source}
            onChange={(e) => changeFilter('source', e.target.value)}
          >
            <option value=''>全部来源</option>
            {status?.sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            className={selectStyle}
            aria-label='按状态筛选'
            value={filters.state}
            onChange={(e) => changeFilter('state', e.target.value)}
          >
            <option value=''>全部状态</option>
            <option value='enabled'>已启用</option>
            <option value='disabled'>已停用</option>
          </select>
          <select
            className={selectStyle}
            aria-label='按实测地区筛选'
            value={filters.country}
            onChange={(e) => changeFilter('country', e.target.value)}
          >
            <option value=''>全部实测地区</option>
            {countries.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button
            size='sm'
            variant='outline'
            disabled={busy || !targets.length}
            onClick={() => operation.mutate({ action: 'test', ids: targets })}
          >
            测试所选连接
          </Button>
          <Button
            size='sm'
            variant='outline'
            disabled={busy || !targets.length}
            onClick={() =>
              operation.mutate({ action: 'quality', ids: targets })
            }
          >
            检测所选网络质量
          </Button>
          <Button
            size='sm'
            variant='outline'
            disabled={busy || !targets.length}
            onClick={() =>
              operation.mutate({ action: 'node_enable', ids: targets })
            }
          >
            启用所选
          </Button>
          <Button
            size='sm'
            variant='outline'
            disabled={busy || !targets.length}
            onClick={() =>
              ask(
                { action: 'node_disable', ids: targets },
                '停用所选节点会拒绝其已有代理绑定的流量，不自动切换出口。'
              )
            }
          >
            停用所选
          </Button>
          <Button
            size='sm'
            disabled={busy || !targets.length || !status?.running}
            onClick={() =>
              ask(
                { action: 'node_export', ids: targets },
                '将所选节点加入下方代理池，然后绑定到本机槽位；动态代理的公网 IP 仍由供应商决定。'
              )
            }
          >
            添加所选到代理池
          </Button>
        </div>
        <p className='text-xs text-muted-foreground'>
          检测使用独立内核，不切换业务出口；质量结果仅代表常见 HTTPS
          站点连通性，不代表模型可用或 IP 风险等级。
        </p>
        <div className='overflow-x-auto rounded-lg border'>
          <table className='w-full text-left text-sm'>
            <thead className='bg-muted/40'>
              <tr>
                <th className='w-10 p-3'>
                  <input
                    type='checkbox'
                    aria-label='选择本页节点'
                    checked={
                      !!visible.length &&
                      visible.every((n) => selected.includes(n.id))
                    }
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [
                              ...new Set([
                                ...selected,
                                ...visible.map((n) => n.id),
                              ]),
                            ]
                          : selected.filter(
                              (id) => !visible.some((n) => n.id === id)
                            )
                      )
                    }
                  />
                </th>
                <th className='p-3'>节点</th>
                <th className='p-3'>状态</th>
                <th className='p-3'>实测出口</th>
                <th className='p-3'>连接 / 质量</th>
                <th className='p-3'>操作</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((n) => (
                <tr key={n.id} className='border-t'>
                  <td className='p-3'>
                    <input
                      type='checkbox'
                      aria-label={`选择 ${n.label}`}
                      checked={selected.includes(n.id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, n.id]
                            : selected.filter((id) => id !== n.id)
                        )
                      }
                    />
                  </td>
                  <td className='max-w-xs p-3'>
                    <p className='font-medium break-all'>{n.label}</p>
                    <p className='text-xs text-muted-foreground'>
                      {n.type}
                      {n.dynamic ? ' · 动态 IP' : ''}
                      {n.proxy_id ? ' · 已加入代理池' : ''}
                    </p>
                  </td>
                  <td className='p-3 whitespace-nowrap'>
                    {n.enabled ? '已启用' : '已停用'}
                  </td>
                  <td className='p-3'>
                    {n.check?.geo?.ip || '未检测'}
                    <p className='text-xs text-muted-foreground'>
                      {n.check?.geo?.country || ''}
                    </p>
                  </td>
                  <td className='p-3 whitespace-nowrap'>
                    {n.check
                      ? n.check.success
                        ? `${n.check.latency_ms} ms`
                        : '连接失败'
                      : '未检测'}
                    {n.check?.quality && (
                      <p className='text-xs text-muted-foreground'>
                        {n.check.quality.passed}/{n.check.quality.total}{' '}
                        站点通过
                      </p>
                    )}
                  </td>
                  <td className='p-3'>
                    <div className='flex gap-1'>
                      <Button
                        size='sm'
                        variant='ghost'
                        disabled={busy}
                        onClick={() =>
                          operation.mutate({ action: 'test', id: n.id })
                        }
                      >
                        检测
                      </Button>
                      {n.proxy_id && (
                        <Button
                          size='sm'
                          variant='ghost'
                          disabled={busy}
                          onClick={() =>
                            ask(
                              { action: 'node_unexport', id: n.id },
                              '从代理池移除此节点？已绑定槽位的节点需先解除绑定，原端口不会分配给其他节点。'
                            )
                          }
                        >
                          移出代理池
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visible.length && (
            <p className='p-6 text-center text-sm text-muted-foreground'>
              没有匹配的节点
            </p>
          )}
        </div>
        <div className='flex items-center justify-end gap-3 text-sm'>
          <span>
            {currentPage + 1} / {lastPage + 1}
          </span>
          <Button
            size='sm'
            variant='outline'
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            上一页
          </Button>
          <Button
            size='sm'
            variant='outline'
            disabled={currentPage === lastPage}
            onClick={() => setPage(currentPage + 1)}
          >
            下一页
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirm(null)
        }}
        title='确认代理操作'
        desc={confirm?.message || ''}
        confirmText='确认'
        cancelBtnText='取消'
        isLoading={busy}
        handleConfirm={() => {
          if (confirm) operation.mutate(confirm.body)
        }}
      />
    </section>
  )
}
