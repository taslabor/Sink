// GET /api/batch/[id]/stats → { visits, visitors, linkCount, indexed, approxVisitors }
//
// Aggregates Analytics Engine stats across all links in a batch. Uses the
// membership index (batch_links:<id>) to get the link ids, then runs a single
// weighted query filtered to those ids (index1 = link id). For batches larger
// than CHUNK links the query is split, which keeps `visits` exact (additive)
// but makes `visitors` a sum across chunks (a slight over-count of uniques) —
// flagged via `approxVisitors`.

const { select } = SqlBricks

function buildSql(ids: string[], dataset: string): string {
  // Weighted distinct: COUNT(DISTINCT col) * SUM(_sample_interval) / COUNT()
  const weightedDistinct = (col: string) => `ROUND(COUNT(DISTINCT ${col}) * SUM(_sample_interval) / COUNT())`
  const columns = [
    'SUM(_sample_interval) as visits',
    `${weightedDistinct(logsMap.ip!)} as visitors`,
  ].join(', ')
  return select(columns).from(dataset).where(SqlBricks.in('index1', ids)).toString()
}

export default eventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ status: 400, statusText: 'Missing batch id' })

  const { dataset } = useRuntimeConfig(event)

  const refs = await getBatchLinkRefs(event, id)
  const ids = refs.map(r => r.id).filter(Boolean)

  if (!ids.length) {
    // No index yet (e.g. a batch created before reindex) or genuinely empty.
    return { visits: 0, visitors: 0, linkCount: 0, indexed: refs.length > 0, approxVisitors: false }
  }

  const CHUNK = 400
  let visits = 0
  let visitors = 0
  let approxVisitors = false

  for (let i = 0; i < ids.length; i += CHUNK) {
    if (i > 0)
      approxVisitors = true
    const slice = ids.slice(i, i + CHUNK)
    const res = await useWAE(event, buildSql(slice, dataset)) as { data?: { visits: number, visitors: number }[] }
    const row = res.data?.[0]
    visits += Number(row?.visits ?? 0)
    visitors += Number(row?.visitors ?? 0)
  }

  return { visits, visitors, linkCount: ids.length, indexed: true, approxVisitors }
})
