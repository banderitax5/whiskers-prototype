#!/usr/bin/env node
/**
 * Copy external product images into Supabase Storage.
 *
 * Why this exists:
 *   The bulk CSV import stores product.image_url exactly as supplied. It does
 *   not download the image or copy it into the `product-images` bucket. This
 *   one-off script does that copy, then rewrites product.image_url to the
 *   public bucket URL.
 *
 * Safety:
 *   - Dry-run by default. Nothing is fetched, uploaded, or updated unless
 *     you pass --check (fetch + validate only) or --apply (fetch + upload +
 *     update).
 *   - --apply is required for writes.
 *   - URLs are checked against private/internal address ranges. Redirects are
 *     followed manually (max 3) and every hop is checked again.
 *   - The 45 blank image_url rows are skipped.
 *   - Products already pointing at this bucket are skipped unless --force.
 *
 * Usage (from backend/):
 *   node scripts/localize-product-images.js
 *   node scripts/localize-product-images.js --check --limit=20
 *   node scripts/localize-product-images.js --apply --limit=10
 *   node scripts/localize-product-images.js --apply
 *
 * Options:
 *   --apply              Upload and update product.image_url (required for writes)
 *   --check              Dry-run that fetches/validates images without uploading
 *   --force              Re-process rows already pointing at the bucket
 *   --limit=N            Process only the first N candidates
 *   --concurrency=N      Parallel downloads (default 3, max 8)
 *   --timeout=MS         Per-request timeout (default 15000)
 *   --max-bytes=N        Source image size limit (default 5242880 = 5MB)
 *   --bucket=NAME        Storage bucket (default product-images)
 *   --report=PATH        CSV report path
 *   --help               Show this help
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_KEY in backend/.env.
 *
 * Note: copying retailer images does not change the rights/permission to use
 * them. Make sure the catalog images are licensed for your store.
 */

import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import dns from 'node:dns/promises'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: process.env.ENV_FILE || path.resolve(SCRIPT_DIR, '..', '.env') })

const HELP = `Copy external product images into Supabase Storage.

Usage (from backend/):
  node scripts/localize-product-images.js [options]

Modes:
  (default)            List what would be processed. No network, no writes.
  --check              Fetch and validate images. No uploads, no DB writes.
  --apply              Fetch, upload to the bucket, and update product.image_url.

Options:
  --apply              Enable uploads and DB updates.
  --check              Fetch/validate only (cannot be combined with --apply).
  --force              Re-process images already in the bucket.
  --limit=N            Process only the first N candidates.
  --concurrency=N      Parallel downloads (default 3, max 8).
  --timeout=MS         Per-request timeout (default 15000).
  --max-bytes=N        Source image size limit (default 5242880).
  --bucket=NAME        Storage bucket (default product-images).
  --report=PATH        CSV report path.
  --help               Show this help.

Environment:
  SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in backend/.env.
`

const args = process.argv.slice(2)
const hasFlag = (name) => args.includes(`--${name}`)
const option = (name, fallback) => {
  const prefix = `--${name}=`
  const hit = args.find((arg) => arg.startsWith(prefix))
  return hit ? hit.slice(prefix.length) : fallback
}

function fail(message) {
  console.error(`\nError: ${message}\n`)
  process.exit(1)
}

function intOption(name, fallback, min, max) {
  const raw = option(name, String(fallback))
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min || value > max) {
    fail(`--${name} must be an integer between ${min} and ${max} (got ${raw})`)
  }
  return value
}

if (hasFlag('help')) {
  console.log(HELP)
  process.exit(0)
}

const apply = hasFlag('apply')
const check = hasFlag('check')
if (apply && check) fail('--apply and --check cannot be used together')

const force = hasFlag('force')
const concurrency = intOption('concurrency', 3, 1, 8)
const timeoutMs = intOption('timeout', 15_000, 1_000, 120_000)
const maxBytes = intOption('max-bytes', 5 * 1024 * 1024, 1_024, 50 * 1024 * 1024)
const bucket = option('bucket', 'product-images')
const limitRaw = option('limit', '')
const limit = limitRaw === '' ? null : intOption('limit', 0, 1, 1_000_000)

if (!/^[a-z0-9][a-z0-9-_]{0,62}$/i.test(bucket)) {
  fail(`invalid bucket name: ${bucket}`)
}

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  fail('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in backend/.env')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const reportPath = path.resolve(
  option('report', path.join(SCRIPT_DIR, 'reports', `image-localization-${stamp}.csv`))
)
fs.mkdirSync(path.dirname(reportPath), { recursive: true })
const report = fs.createWriteStream(reportPath, { flags: 'w' })

const REPORT_COLUMNS = [
  'prod_id',
  'prod_name',
  'source_url',
  'final_url',
  'status',
  'http_status',
  'content_type',
  'source_bytes',
  'jpeg_bytes',
  'bucket_url',
  'error',
  'duration_ms',
]

function csvCell(value) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function writeReportRow(row) {
  report.write(REPORT_COLUMNS.map((column) => csvCell(row[column])).join(',') + '\n')
}

report.write(REPORT_COLUMNS.join(',') + '\n')

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && (b === 168 || b === 0)) return true
    if (a === 198 && (b === 18 || b === 19)) return true
    if (a >= 224) return true
    return false
  }
  if (net.isIPv6(ip)) {
    const h = ip.toLowerCase()
    if (h === '::' || h === '::1') return true
    if (h.startsWith('fc') || h.startsWith('fd')) return true
    if (/^fe[89ab]/.test(h)) return true
    if (h.startsWith('::ffff:')) return isPrivateIp(h.slice(7))
    return false
  }
  return true
}

async function isSafeUrl(urlStr) {
  let parsed
  try {
    parsed = new URL(urlStr)
  } catch {
    return false
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return false
  if (parsed.username || parsed.password) return false

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    return false
  }
  if (hostname === 'metadata.google.internal') return false

  let addresses
  if (net.isIP(hostname)) {
    addresses = [hostname]
  } else {
    try {
      addresses = (await dns.lookup(hostname, { all: true })).map((entry) => entry.address)
    } catch {
      return false
    }
  }
  return addresses.length > 0 && addresses.every((address) => !isPrivateIp(address))
}

function isBucketUrl(url, bucketName) {
  return (
    url.includes(`/storage/v1/object/public/${bucketName}/`) ||
    url.includes(`/storage/v1/object/sign/${bucketName}/`)
  )
}

const FETCH_HEADERS = {
  'User-Agent': 'WhiskersImageLocalizer/1.0',
  Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,image/*;q=0.8',
}

async function fetchImage(sourceUrl, timeout) {
  let current = sourceUrl
  for (let hop = 0; hop <= 3; hop++) {
    if (!(await isSafeUrl(current))) {
      throw new Error('URL is not allowed (private/internal address or unresolvable host)')
    }

    let response
    try {
      response = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(timeout),
        headers: FETCH_HEADERS,
      })
    } catch (error) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        throw new Error(`timeout after ${timeout}ms`)
      }
      throw new Error(`fetch failed: ${error?.message || error}`)
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      await response.body?.cancel().catch(() => {})
      if (!location) throw new Error(`HTTP ${response.status} redirect without Location`)
      current = new URL(location, current).toString()
      continue
    }

    return { response, finalUrl: current, redirects: hop }
  }

  throw new Error('too many redirects (max 3)')
}

// We upload everything as JPEG, but accept the common raster types that
// sharp can read. SVG is rejected because it is a document format, not a
// raster image, and can carry external references.
const REJECTED_CONTENT_TYPES = new Set(['image/svg+xml'])

async function localizeSource(sourceUrl, options) {
  const { response, finalUrl, redirects } = await fetchImage(sourceUrl, options.timeoutMs)
  let consumed = false

  try {
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const contentType = (response.headers.get('content-type') || '')
      .split(';')[0]
      .trim()
      .toLowerCase()
    if (!contentType.startsWith('image/')) {
      throw new Error(`URL does not point to an image (${contentType || 'no content-type'})`)
    }
    if (REJECTED_CONTENT_TYPES.has(contentType)) {
      throw new Error(`unsupported image type (${contentType})`)
    }

    const declared = Number(response.headers.get('content-length') || 0)
    if (declared > options.maxBytes) {
      throw new Error(`source exceeds ${options.maxBytes} bytes (declared ${declared})`)
    }

    const source = Buffer.from(await response.arrayBuffer())
    consumed = true
    if (source.length > options.maxBytes) {
      throw new Error(`source exceeds ${options.maxBytes} bytes`)
    }

    const jpeg = await sharp(source)
      .rotate()
      .resize({ width: 1200, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer()

    const meta = {
      finalUrl,
      redirects,
      httpStatus: response.status,
      contentType,
      sourceBytes: source.length,
      jpegBytes: jpeg.length,
    }

    if (options.checkOnly) {
      return { ...meta, publicUrl: null }
    }

    const fileName = `${Date.now()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}.jpg`
    const { error: uploadError } = await supabase.storage.from(options.bucket).upload(fileName, jpeg, {
      contentType: 'image/jpeg',
      cacheControl: '31536000',
      upsert: false,
    })
    if (uploadError) throw new Error(`upload failed: ${uploadError.message}`)

    const { data } = supabase.storage.from(options.bucket).getPublicUrl(fileName)
    if (!data?.publicUrl) throw new Error('could not build public URL')

    return { ...meta, publicUrl: data.publicUrl, fileName }
  } finally {
    if (!consumed) await response.body?.cancel().catch(() => {})
  }
}

async function ensureBucket() {
  const { data: buckets, error } = await supabase.storage.listBuckets()
  if (error) throw new Error(`listBuckets failed: ${error.message}`)

  const existing = (buckets || []).find((entry) => entry.name === bucket)
  if (existing) {
    if (existing.public === false) {
      console.warn(
        `Warning: bucket "${bucket}" exists but is not public. ` +
          'The storefront will not be able to load the public URLs.'
      )
    }
    return
  }

  const { error: createError } = await supabase.storage.createBucket(bucket, {
    public: true,
    fileSizeLimit: maxBytes,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif'],
  })
  if (createError) throw new Error(`createBucket failed: ${createError.message}`)
  console.log(`Created storage bucket "${bucket}".`)
}

async function loadProducts() {
  const rows = []
  const pageSize = 1000

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('product')
      .select('prod_id, prod_name, image_url')
      .order('prod_id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) throw new Error(`product query failed: ${error.message}`)

    const page = data || []
    rows.push(...page)
    if (page.length < pageSize) break
  }

  return rows
}

async function setProductImage(prodId, publicUrl) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { error } = await supabase
      .from('product')
      .update({ image_url: publicUrl })
      .eq('prod_id', prodId)

    if (!error) return
    if (attempt === 2) throw new Error(`db update failed: ${error.message}`)
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
}

async function mapLimit(items, limitCount, worker) {
  let next = 0
  const runners = Array.from({ length: Math.min(limitCount, items.length) }, async () => {
    while (true) {
      const index = next++
      if (index >= items.length) return
      await worker(items[index], index)
    }
  })
  await Promise.all(runners)
}

async function main() {
  console.log(`\nWhiskers product image localizer`)
  console.log(`Mode: ${apply ? 'APPLY (upload + update)' : check ? 'CHECK (fetch only)' : 'DRY-RUN (list only)'}`)
  console.log(`Bucket: ${bucket}`)
  console.log(`Report: ${reportPath}\n`)

  const products = await loadProducts()
  const withImage = products.filter((product) => String(product.image_url || '').trim() !== '')
  const blank = products.length - withImage.length
  const already = withImage.filter((product) => isBucketUrl(String(product.image_url).trim(), bucket))
  const external = withImage.filter(
    (product) => force || !isBucketUrl(String(product.image_url).trim(), bucket)
  )
  const selected = limit === null ? external : external.slice(0, limit)
  const uniqueUrls = new Set(selected.map((product) => String(product.image_url).trim()))

  console.log(`Products scanned:     ${products.length}`)
  console.log(`With image:           ${withImage.length}`)
  console.log(`Blank image:          ${blank}`)
  console.log(`Already in bucket:    ${already.length}${force ? ' (force: will re-process)' : ' (skipped)'}`)
  console.log(`Candidates:           ${selected.length}`)
  console.log(`Unique source URLs:   ${uniqueUrls.size}\n`)

  for (const product of already) {
    if (force) continue
    writeReportRow({
      prod_id: product.prod_id,
      prod_name: product.prod_name,
      source_url: product.image_url,
      status: 'skipped_bucket',
    })
  }

  if (!apply && !check) {
    for (const product of selected) {
      writeReportRow({
        prod_id: product.prod_id,
        prod_name: product.prod_name,
        source_url: product.image_url,
        status: 'planned',
      })
    }
    console.log('Dry-run only. Nothing was fetched, uploaded, or updated.')
    console.log('Next: --check --limit=20, then --apply --limit=10, then --apply.\n')
    return
  }

  if (apply) await ensureBucket()

  const options = { timeoutMs, maxBytes, bucket, checkOnly: check && !apply }
  const cache = new Map()
  const summary = { updated: 0, would_update: 0, failed: 0 }
  let completed = 0

  const startedAt = Date.now()

  await mapLimit(selected, concurrency, async (product) => {
    const sourceUrl = String(product.image_url).trim()
    const row = {
      prod_id: product.prod_id,
      prod_name: product.prod_name,
      source_url: sourceUrl,
    }
    const itemStarted = Date.now()

    try {
      if (!cache.has(sourceUrl)) {
        cache.set(sourceUrl, localizeSource(sourceUrl, options))
      }

      const result = await cache.get(sourceUrl)
      row.final_url = result.finalUrl
      row.http_status = result.httpStatus
      row.content_type = result.contentType
      row.source_bytes = result.sourceBytes
      row.jpeg_bytes = result.jpegBytes

      if (apply) {
        await setProductImage(product.prod_id, result.publicUrl)
        row.bucket_url = result.publicUrl
        row.status = 'updated'
        summary.updated++
      } else {
        row.status = 'would_update'
        summary.would_update++
      }
    } catch (error) {
      row.status = 'failed'
      row.error = String(error?.message || error).slice(0, 500)
      summary.failed++
    }

    row.duration_ms = Date.now() - itemStarted
    writeReportRow(row)

    completed++
    if (completed % 10 === 0 || completed === selected.length) {
      console.log(
        `[${completed}/${selected.length}] updated=${summary.updated} ` +
          `check-ok=${summary.would_update} failed=${summary.failed}`
      )
    }
  })

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(`\nDone in ${seconds}s.`)
  console.log(`Updated:       ${summary.updated}`)
  console.log(`Would update:  ${summary.would_update}`)
  console.log(`Failed:        ${summary.failed}`)
  console.log(`Skipped blank: ${blank}`)
  console.log(`Report:        ${reportPath}\n`)

  if (summary.failed > 0) {
    console.log('Failed rows were left unchanged. Open the report CSV and filter status=failed.')
  }
  if (apply) {
    console.log('The 45 blank-image products still have no image. Add those manually or leave placeholders.')
  }
}

try {
  await main()
} catch (error) {
  console.error(`\nFatal: ${error?.message || error}\n`)
  process.exitCode = 1
} finally {
  await new Promise((resolve) => report.end(resolve))
}
