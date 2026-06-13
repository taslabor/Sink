// GET /api/batch
// Returns: { batches: Batch[], cursor?: string, list_complete: boolean }

export default defineEventHandler(async (event) => {
  const { KV } = event.context.cloudflare.env

  const query = getQuery(event)
  const cursor = query.cursor as string | undefined
  const limit = Math.min(parseInt((query.limit as string) || '50'), 200)

  const listResult = await KV.list({
    prefix: 'batch:',
    limit,
    cursor,
  })

  const batches = await Promise.all(
    listResult.keys.map(async (key) => {
      const raw = await KV.get(key.name)
      if (!raw) return null
      return JSON.parse(raw)
    }),
  )

  return {
    batches: batches.filter(Boolean),
    cursor: listResult.cursor,
    list_complete: listResult.list_complete,
  }
})
