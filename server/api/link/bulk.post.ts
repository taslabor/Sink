import { LinkSchema } from '#shared/schemas/link'
import type { Batch } from '#shared/types/batch'

// POST /api/link/bulk
// Body (create new batch):  { batchName: string, batchComment?: string, links: [...] }
// Body (append to existing): { batchId: string, links: [...] }
//
// Reuses the SAME helpers as /api/link/create (prepareIncomingLink, getLink,
// hashLinkPasswordForCreate, putLink) so bulk-created links are byte-for-byte
// consistent with single-created ones. Each created link is stamped with its
// batchId, so links can be added to a batch progressively across many requests
// (e.g. from automations) — even one link at a time.
//
// Auth: handled by the same global /api middleware that protects /api/link/create.

export default eventHandler(async (event) => {
  const body = await readBody(event)

  const providedBatchId = body?.batchId ? body.batchId.toString().trim() : undefined
  const batchName = (body?.batchName ?? '').toString().trim()
  const batchComment = body?.batchComment ? body.batchComment.toString().trim() : undefined
  const rawLinks = Array.isArray(body?.links) ? body.links : []

  if (rawLinks.length === 0)
    throw createError({ status: 400, statusText: 'At least one link is required' })
  if (rawLinks.length > 10000)
    throw createError({ status: 400, statusText: 'Maximum 10,000 links per request' })

  const { KV } = event.context.cloudflare.env
  const now = Math.floor(Date.now() / 1000)

  // Resolve the target batch: append to an existing one, or create a new one.
  let batch: Batch
  if (providedBatchId) {
    const raw = await KV.get(`batch:${providedBatchId}`)
    if (!raw)
      throw createError({ status: 404, statusText: 'Batch not found' })
    batch = JSON.parse(raw) as Batch
  }
  else {
    if (!batchName)
      throw createError({ status: 400, statusText: 'Either batchId (to append) or batchName (to create) is required' })
    batch = { id: crypto.randomUUID(), name: batchName, comment: batchComment, createdAt: now, count: 0 }
    // Persist the new batch record up front so it exists even if every link fails.
    await KV.put(`batch:${batch.id}`, JSON.stringify(batch))
  }

  const batchId = batch.id
  const results: Array<{ url: string, slug?: string, success: boolean, error?: string }> = []

  for (const raw of rawLinks) {
    try {
      const link: any = LinkSchema.parse(raw)
      await prepareIncomingLink(event, link)

      const existing = await getLink(event, link.slug)
      if (existing) {
        results.push({ url: link.url, slug: link.slug, success: false, error: `Slug "${link.slug}" already exists` })
        continue
      }

      // Stamp the batch id so this link is grouped with the batch.
      link.batchId = batchId

      await hashLinkPasswordForCreate(link)
      await putLink(event, link)

      results.push({ url: link.url, slug: link.slug, success: true })
    }
    catch (err: any) {
      results.push({ url: raw?.url ?? '', slug: raw?.slug, success: false, error: err?.message || 'Invalid link' })
    }
  }

  const added = results.filter(r => r.success).length

  // Best-effort count update. Re-read immediately before writing to shrink the
  // race window when multiple requests append to the same batch concurrently.
  // KV has no atomic increment, so the stored count can still drift slightly
  // under heavy parallel writes — the batch detail page shows the exact count
  // by scanning, so this is only the at-a-glance figure on the list page.
  const latestRaw = await KV.get(`batch:${batchId}`)
  const latest: Batch = latestRaw ? JSON.parse(latestRaw) : batch
  latest.count = (latest.count || 0) + added
  await KV.put(`batch:${batchId}`, JSON.stringify(latest))

  setResponseStatus(event, 201)
  return { batch: latest, added, results }
})
