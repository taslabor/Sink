import type { Batch } from '#shared/types/batch'

// POST /api/batch
// Body: { name: string, comment?: string }
// Creates an empty batch and returns it (with id). Use the returned id as
// `batchId` in subsequent POST /api/link/bulk calls to add links over time —
// useful for automations that build a batch up across many requests.

export default eventHandler(async (event) => {
  const body = await readBody(event)
  const name = (body?.name ?? '').toString().trim()
  if (!name)
    throw createError({ status: 400, statusText: 'Batch name is required' })

  const comment = body?.comment ? body.comment.toString().trim() : undefined

  const { KV } = event.context.cloudflare.env
  const batch: Batch = {
    id: crypto.randomUUID(),
    name,
    comment,
    createdAt: Math.floor(Date.now() / 1000),
    count: 0,
  }
  await KV.put(`batch:${batch.id}`, JSON.stringify(batch))

  setResponseStatus(event, 201)
  return batch
})
