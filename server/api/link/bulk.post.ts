import { LinkSchema } from '#shared/schemas/link'
import type { Batch } from '#shared/types/batch'

// POST /api/link/bulk
// Body: { batchName: string, batchComment?: string, links: Array<LinkInput> }
// Reuses the SAME helpers as /api/link/create (prepareIncomingLink, getLink,
// hashLinkPasswordForCreate, putLink) so bulk-created links are byte-for-byte
// consistent with single-created ones — same slug generation, same KV key
// format, same field handling. Each created link is stamped with `batchId`.
//
// Auth: handled by the same global /api middleware that protects /api/link/create
// (that endpoint has no in-handler token check either).

export default eventHandler(async (event) => {
  const body = await readBody(event)

  const batchName = (body?.batchName ?? '').toString().trim()
  const batchComment = body?.batchComment ? body.batchComment.toString().trim() : undefined
  const rawLinks = Array.isArray(body?.links) ? body.links : []

  if (!batchName)
    throw createError({ status: 400, statusText: 'Batch name is required' })
  if (rawLinks.length === 0)
    throw createError({ status: 400, statusText: 'At least one link is required' })
  if (rawLinks.length > 10000)
    throw createError({ status: 400, statusText: 'Maximum 10,000 links per batch' })

  // NOTE: raw KV access for the batch record. The link helpers above abstract
  // KV for links; batches have no helper, so we use the binding directly.
  // If your link utils access KV via a different accessor, match it here.
  const { KV } = event.context.cloudflare.env

  const batchId = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)

  const results: Array<{ url: string, slug?: string, success: boolean, error?: string }> = []

  for (const raw of rawLinks) {
    try {
      // Validate with the same schema the create endpoint uses
      const link: any = LinkSchema.parse(raw)

      // Same preparation as create: generates slug if missing, sets id /
      // timestamps, normalises fields
      await prepareIncomingLink(event, link)

      // Reject duplicates (same behaviour as create's 409)
      const existing = await getLink(event, link.slug)
      if (existing) {
        results.push({ url: link.url, slug: link.slug, success: false, error: `Slug "${link.slug}" already exists` })
        continue
      }

      // Stamp the batch id so links can be grouped later
      link.batchId = batchId

      await hashLinkPasswordForCreate(link)
      await putLink(event, link)

      results.push({ url: link.url, slug: link.slug, success: true })
    }
    catch (err: any) {
      results.push({ url: raw?.url ?? '', slug: raw?.slug, success: false, error: err?.message || 'Invalid link' })
    }
  }

  const count = results.filter(r => r.success).length

  const batch: Batch = { id: batchId, name: batchName, comment: batchComment, createdAt: now, count }
  await KV.put(`batch:${batchId}`, JSON.stringify(batch))

  setResponseStatus(event, 201)
  return { batch, results }
})
