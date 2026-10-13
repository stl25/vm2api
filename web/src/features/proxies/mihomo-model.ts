export type MihomoCheck = {
  success: boolean
  latency_ms: number
  checked_at?: string
  geo?: { ip?: string; country?: string; country_code?: string }
  quality?: { passed: number; total: number; summary: string }
}
export type MihomoNode = {
  id: string
  label: string
  type: string
  enabled: boolean
  dynamic: boolean
  source_ids: string[]
  proxy_id: string | null
  check: MihomoCheck | null
}
export type MihomoSource = {
  id: string
  label: string
  kind: 'subscription' | 'dynamic'
  enabled: boolean
  nodes: number
  updated_at: string
}
export type MihomoStatus = {
  installed: boolean
  running: boolean
  version: string
  busy: boolean
  error: string | null
  download_mode: 'auto' | 'direct' | 'proxy'
  sources: MihomoSource[]
  nodes: MihomoNode[]
}
export function filterMihomoNodes(
  nodes: MihomoNode[],
  filters: { search: string; source: string; state: string; country: string }
) {
  const query = filters.search.trim().toLowerCase()
  return nodes.filter(
    (n) =>
      (!query || n.label.toLowerCase().includes(query)) &&
      (!filters.source || n.source_ids.includes(filters.source)) &&
      (!filters.state || n.enabled === (filters.state === 'enabled')) &&
      (!filters.country || n.check?.geo?.country_code === filters.country)
  )
}
export function selectedMihomoNodes(nodes: MihomoNode[], ids: string[]) {
  const selected = new Set(ids)
  return nodes.filter((n) => selected.has(n.id)).map((n) => n.id)
}
