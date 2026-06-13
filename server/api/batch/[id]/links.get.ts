// GET /api/batch/[id]/links
// Scans KV for links belonging to the given batchId via cursor pagination
// Returns: { links: Link[], cursor?: string, list_complete: boolean }

export default defineEventHandler(async (event) => {
  const { KV } = event.context.cloudflare.env

  const batchId = getRouterParam(event, 'id')
  if (!batchId) {
    throw createError({ statusCode: 400, message: 'Missing batch ID' })
  }

  // Verify batch exists
  const batchRaw = await KV.get(`batch:${batchId}`)
  if (!batchRaw) {
    throw createError({ statusCode: 404, message: 'Batch not found' })
  }

  const query = getQuery(event)
  const cursor = query.cursor as string | undefined
  // Fetch in pages of 100 KV keys; filter by batchId; collect until we have `limit` matching or exhausted
  const requestedLimit = Math.min(parseInt((query.limit as string) || '100'), 500)

  const matchingLinks: any[] = []
  let currentCursor = cursor
  let list_complete = false

  // We scan in batches since we can't query KV by value — this is the expected pattern
  // for admin/dashboard use (not on the hot redirect path)
  while (matchingLinks.length < requestedLimit) {
    const listResult = await KV.list({
      prefix: 'link:',
      limit: 200, // fetch 200 at a time to minimise round trips
      cursor: currentCursor,
    })

    const linkValues = await Promise.all(
      listResult.keys.map(async (key) => {
        const raw = await KV.get(key.name)
        if (!raw) return null
        const link = JSON.parse(raw)
        return link.batchId === batchId ? link : null
      }),
    )

    matchingLinks.push(...linkValues.filter(Boolean))
    currentCursor = listResult.cursor
    list_complete = listResult.list_complete

    if (list_complete || matchingLinks.length >= requestedLimit) break
  }

  return {
    batchId,
    batch: JSON.parse(batchRaw),
    links: matchingLinks.slice(0, requestedLimit),
    cursor: list_complete ? undefined : currentCursor,
    list_complete: list_complete && matchingLinks.length <= requestedLimit,
  }
})
