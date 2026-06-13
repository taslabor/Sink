// DELETE /api/batch/[id]?withLinks=true|false&cursor=...
//
// Deletes a batch. Two modes:
//   withLinks=true   → also delete every link in the batch
//   withLinks=false  → keep the links, but remove their batch grouping (clears batchId)
//
// Cloudflare limits how many KV operations a single request may make, so this
// processes ONE page of the keyspace per call and returns a cursor. The client
// calls it repeatedly until { done: true }. The batch record itself is removed on
// the final page, once the whole keyspace has been scanned — so the batch only
// disappears after all its links have been handled.

export default eventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ status: 400, statusText: 'Missing batch id' })

  const { KV } = event.context.cloudflare.env

  const query = getQuery(event)
  const withLinks = query.withLinks === 'true' || query.withLinks === '1'
  const cursor = (query.cursor as string) || undefined

  // Page size for the keyspace scan. Each matched link costs a read plus a
  // write/delete, so keep this comfortably under the per-request subrequest
  // limit. 50 is safe on Workers Paid; drop toward 20 on the Free plan.
  const PAGE = 50

  // The batch record still exists on every page except the last (we delete it
  // only when the scan completes), so a 404 here means a genuinely missing batch.
  const batchRaw = await KV.get(`batch:${id}`)
  if (!batchRaw)
    throw createError({ status: 404, statusText: 'Batch not found' })

  const list = await KV.list({ prefix: 'link:', limit: PAGE, cursor })

  let affected = 0
  await Promise.all(list.keys.map(async (key: { name: string }) => {
    const link = await KV.get(key.name, { type: 'json' }) as any
    if (!link || link.batchId !== id)
      return

    if (withLinks) {
      await KV.delete(key.name)
      affected++
    }
    else {
      // Keep the link, drop only the grouping. Re-save through putLink so the
      // KV key, TTL and metadata stay exactly as the rest of the app expects.
      delete link.batchId
      await putLink(event, link)
      affected++
    }
  }))

  const done = list.list_complete
  if (done)
    await KV.delete(`batch:${id}`)

  return {
    done,
    cursor: done ? undefined : list.cursor,
    scanned: list.keys.length,
    affected,
  }
})
