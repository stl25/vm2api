import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { createHash } from 'node:crypto'
import { resolveMihomoRelease, downloadMihomoRelease } from '../../src/lib/mihomo/releases.mjs'

const bytes = Buffer.from('kernel fixture')
const digest = 'sha256:' + createHash('sha256').update(bytes).digest('hex')
const release = (version = 'v1.20.1') => ({
  tag_name: version,
  draft: false,
  prerelease: false,
  assets: ['amd64-compatible', 'arm64'].map((arch) => ({
    name: `mihomo-linux-${arch}-${version}.gz`,
    size: bytes.length,
    digest,
  })),
})
const fetchRelease = (body) => async () => ({ ok: true, json: async () => body })

test('latest stable release is resolved live for each install and selects the supported architecture', async () => {
  const urls = []
  const fetchImpl = async (url) => {
    urls.push(url)
    return { ok: true, json: async () => release(urls.length === 1 ? 'v1.20.1' : 'v1.20.2') }
  }
  const first = await resolveMihomoRelease('latest', { arch: 'x64', fetchImpl })
  const next = await resolveMihomoRelease('latest', { arch: 'arm64', fetchImpl })
  assert.equal(first.asset, 'mihomo-linux-amd64-compatible-v1.20.1.gz')
  assert.equal(next.asset, 'mihomo-linux-arm64-v1.20.2.gz')
  assert.equal(first.sha256, digest.slice(7))
  assert.ok(urls.every((url) => url.endsWith('/releases/latest')))
})

test('explicit stable versions select the official release endpoint', async () => {
  let requested
  const selected = await resolveMihomoRelease('v1.19.32', {
    arch: 'x64',
    fetchImpl: async (url) => {
      requested = url
      return { ok: true, json: async () => release('v1.19.32') }
    },
  })
  assert.equal(selected.version, 'v1.19.32')
  assert.equal(requested, 'https://api.github.com/repos/MetaCubeX/mihomo/releases/tags/v1.19.32')
  for (const version of ['Alpha', 'v1.19.32-beta', 'invalid', '', 42])
    await assert.rejects(resolveMihomoRelease(version), { code: 'invalid_kernel_version' })
})

test('missing releases, prereleases and absent checksums never become download candidates', async () => {
  await assert.rejects(resolveMihomoRelease('latest', { arch: 'ia32' }), { code: 'unsupported_platform' })
  await assert.rejects(resolveMihomoRelease('v1.0.0', { fetchImpl: async () => ({ ok: false, status: 404 }) }), {
    code: 'kernel_release_missing',
  })
  await assert.rejects(
    resolveMihomoRelease('latest', {
      fetchImpl: async () => {
        throw new Error('network detail')
      },
    }),
    { code: 'kernel_release_failed' },
  )
  for (const invalid of [
    { ...release(), prerelease: true },
    { ...release(), draft: true },
    release('Alpha'),
    { ...release(), assets: [] },
    { ...release(), assets: [{ ...release().assets[0], digest: null }] },
  ])
    await assert.rejects(resolveMihomoRelease('latest', { fetchImpl: fetchRelease(invalid) }), {
      code: 'kernel_release_invalid',
    })
  await assert.rejects(resolveMihomoRelease('v1.19.32', { fetchImpl: fetchRelease(release()) }), {
    code: 'kernel_release_invalid',
  })
})

test('streamed download reports actual byte progress and verifies the official digest', async () => {
  const selected = await resolveMihomoRelease('latest', { fetchImpl: fetchRelease(release()) })
  const updates = []
  const result = await downloadMihomoRelease(selected, {
    fetchImpl: async () => ({ ok: true, body: Readable.from([bytes.subarray(0, 4), bytes.subarray(4)]) }),
    onProgress: (p) => updates.push(p),
  })
  assert.deepEqual(result, bytes)
  assert.deepEqual(
    updates.map((p) => p.downloaded_bytes),
    [0, 4, bytes.length, bytes.length],
  )
  assert.equal(updates.at(-1).stage, 'verifying')
})

test('corrupt, truncated, oversized and broken downloads fail before installation', async () => {
  const selected = await resolveMihomoRelease('latest', { fetchImpl: fetchRelease(release()) })
  const fetchImpl = (content) => async () => ({ ok: true, body: Readable.from([content]) })
  await assert.rejects(downloadMihomoRelease(selected, { fetchImpl: fetchImpl(Buffer.alloc(bytes.length)) }), {
    code: 'kernel_checksum_failed',
  })
  await assert.rejects(downloadMihomoRelease(selected, { fetchImpl: fetchImpl(bytes.subarray(0, 4)) }), {
    code: 'kernel_checksum_failed',
  })
  await assert.rejects(downloadMihomoRelease(selected, { fetchImpl: fetchImpl(Buffer.alloc(bytes.length + 1)) }), {
    code: 'kernel_download_failed',
  })
  const broken = async () => ({
    ok: true,
    body: Readable.from(
      (async function* () {
        yield bytes.subarray(0, 4)
        throw new Error('interrupted')
      })(),
    ),
  })
  await assert.rejects(downloadMihomoRelease(selected, { fetchImpl: broken }), { code: 'kernel_download_failed' })
})
