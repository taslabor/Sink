import type { H3Event } from 'h3'

// Membership index: which links belong to each batch.
//   batch_links:<batchId>  →  JSON array of { id, slug }
//
// This lets us aggregate a batch's analytics (link ids → Analytics Engine's
// index1) and look up a batch's links without scanning the whole keyspace.
// Auto-imported (server/utils), so no import needed at call sites.

export interface BatchLinkRef {
  id: string
  slug: string
}

export async function getBatchLinkRefs(event: H3Event, batchId: string): Promise<BatchLinkRef[]> {
  const { KV } = event.context.cloudflare.env
  const raw = await KV.get(`batch_links:${batchId}`)
  return raw ? (JSON.parse(raw) as BatchLinkRef[]) : []
}

export async function addBatchLinkRefs(event: H3Event, batchId: string, refs: BatchLinkRef[]): Promise<void> {
  if (!refs.length)
    return
  const { KV } = event.context.cloudflare.env
  // read → concat → dedupe by id → write. Last-write-wins: safe for the
  // sequential writes within a single bulk request, best-effort under truly
  // concurrent appends (the reindex endpoint can rebuild if it ever drifts).
  const existing = await getBatchLinkRefs(event, batchId)
  const seen = new Set(existing.map(r => r.id))
  for (const r of refs) {
    if (r.id && !seen.has(r.id)) {
      existing.push(r)
      seen.add(r.id)
    }
  }
  await KV.put(`batch_links:${batchId}`, JSON.stringify(existing))
}

export async function deleteBatchIndex(event: H3Event, batchId: string): Promise<void> {
  const { KV } = event.context.cloudflare.env
  await KV.delete(`batch_links:${batchId}`)
}
