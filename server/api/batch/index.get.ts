import type { Batch } from '#shared/types/batch'

// GET /api/batch  →  { batches: Batch[], cursor?: string, list_complete: boolean }
// Lists batch metadata records (batch:* keys), newest first.

export default eventHandler(async (event) => {
  const { KV } = event.context.cloudflare.env

  const query = getQuery(event)
  const cursor = query.cursor as string | undefined
  const limit = Math.min(Number.parseInt((query.limit as string) || '100'), 1000)

  const list = await KV.list({ prefix: 'batch:', limit, cursor })

  const batches = (await Promise.all(
    list.keys.map(async (k: { name: string }) => {
      const raw = await KV.get(k.name)
      return raw ? (JSON.parse(raw) as Batch) : null
    }),
  )).filter(Boolean) as Batch[]

  batches.sort((a, b) => b.createdAt - a.createdAt)

  return {
    batches,
    cursor: list.list_complete ? undefined : list.cursor,
    list_complete: list.list_complete,
  }
})
