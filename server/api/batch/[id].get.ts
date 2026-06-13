import type { Batch } from '#shared/types/batch'

// GET /api/batch/:id  →  Batch
// Returns the metadata for a single batch.

export default eventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ status: 400, statusText: 'Missing batch id' })

  const { KV } = event.context.cloudflare.env
  const raw = await KV.get(`batch:${id}`)
  if (!raw)
    throw createError({ status: 404, statusText: 'Batch not found' })

  return JSON.parse(raw) as Batch
})
