import { describe, expect, it } from 'vitest'
import {
  filterMihomoNodes,
  selectedMihomoNodes,
  type MihomoNode,
} from './mihomo-model'

const node = (id: string, enabled = true): MihomoNode => ({
  id,
  label: id,
  type: 'ss',
  enabled,
  dynamic: false,
  source_ids: ['source1'],
  proxy_id: null,
  check: null,
})
describe('Mihomo node selection', () => {
  it('requires explicit selection and limits batch operations to the current filter', () => {
    const rows = [node('JP'), node('US')]
    expect(selectedMihomoNodes(rows, [])).toEqual([])
    expect(selectedMihomoNodes([rows[0]], ['JP', 'US', 'removed'])).toEqual([
      'JP',
    ])
  })
  it('combines source, enabled status, actual country and case-insensitive name', () => {
    const nodes = [node('Japan'), node('US', false)]
    nodes[0].check = {
      success: true,
      latency_ms: 10,
      geo: { country_code: 'JP' },
    }
    expect(
      filterMihomoNodes(nodes, {
        search: 'jap',
        source: 'source1',
        state: 'enabled',
        country: 'JP',
      }).map((n) => n.id)
    ).toEqual(['Japan'])
    expect(
      filterMihomoNodes(nodes, {
        search: '',
        source: '',
        state: 'disabled',
        country: '',
      }).map((n) => n.id)
    ).toEqual(['US'])
  })
})
