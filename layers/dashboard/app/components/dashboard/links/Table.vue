<script setup lang="ts">
import type { CounterData, Link } from '@/types'

// Auto-imported as <DashboardLinksTable />
// Table view of links with:
//  - batch NAME in the Batch column (truncated, full on hover)
//  - sortable columns (incl. by batch)
//  - group-by Batch / Created / Comment
//  - Clicks + Visitors columns (same data as the card view, via /api/stats/counters)

type GroupBy = 'none' | 'batch' | 'created' | 'comment'
type SortKey = 'slug' | 'destination' | 'clicks' | 'visitors' | 'comment' | 'batch' | 'created'

const links = ref<Link[]>([])
const cursor = ref('')
const listComplete = ref(false)
const pending = ref(false)

// id -> counters (undefined until fetched)
const countersMap = ref<Record<string, CounterData>>({})
// batchId -> batch name
const batchNameMap = ref<Record<string, string>>({})

const groupBy = ref<GroupBy>('none')
const sortKey = ref<SortKey>('created')
const sortDir = ref<'asc' | 'desc'>('desc')

const linksStore = useDashboardLinksStore()

// ── Data loading ───────────────────────────────────────────────────────────
async function loadBatches() {
  try {
    const data = await useAPI<{ batches: { id: string, name: string }[] }>('/api/batch')
    const map: Record<string, string> = {}
    for (const b of data.batches ?? [])
      map[b.id] = b.name
    batchNameMap.value = map
  }
  catch {
    // non-fatal — batch column falls back to the id reference
  }
}

async function fetchCounters(ids: string[]) {
  const need = ids.filter(id => id && countersMap.value[id] === undefined)
  if (!need.length)
    return
  try {
    const result = await useAPI<{ data: (CounterData & { id: string })[] }>('/api/stats/counters', {
      query: { id: need.join(',') },
    })
    const next = { ...countersMap.value }
    for (const item of result.data ?? [])
      next[item.id] = { visits: item.visits, visitors: item.visitors, referers: item.referers }
    // anything that returned no rows = zero
    for (const id of need) {
      if (next[id] === undefined)
        next[id] = { visits: 0, visitors: 0, referers: 0 }
    }
    countersMap.value = next
  }
  catch {
    const next = { ...countersMap.value }
    for (const id of need) {
      if (next[id] === undefined)
        next[id] = { visits: 0, visitors: 0, referers: 0 }
    }
    countersMap.value = next
  }
}

async function loadLinks(reset = false) {
  if (reset) {
    links.value = []
    cursor.value = ''
    listComplete.value = false
  }
  pending.value = true
  try {
    const data = await useAPI<{ links: Link[], cursor: string, list_complete: boolean }>('/api/link/list', {
      query: { limit: 50, cursor: cursor.value },
    })
    const fresh = (data.links ?? []).filter(Boolean)
    links.value = reset ? fresh : [...links.value, ...fresh]
    cursor.value = data.cursor
    listComplete.value = data.list_complete ?? false
    fetchCounters(fresh.map(l => l.id))
  }
  finally {
    pending.value = false
  }
}

onMounted(() => {
  loadBatches()
  loadLinks(true)
})

linksStore.onLinkUpdate(({ link, type }) => {
  if (type === 'delete')
    links.value = links.value.filter(l => l.id !== link.id)
  else if (type === 'edit') {
    const i = links.value.findIndex(l => l.id === link.id)
    if (i !== -1)
      links.value[i] = { ...links.value[i], ...link }
  }
})

// ── Helpers ────────────────────────────────────────────────────────────────
function counters(link: Link): CounterData | undefined {
  return countersMap.value[link.id]
}
function batchName(link: Link): string {
  if (!link.batchId)
    return ''
  return batchNameMap.value[link.batchId] ?? ''
}
function formatDate(unix?: number) {
  if (!unix)
    return '—'
  return new Date(unix * 1000).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function sortValue(link: Link, key: SortKey): string | number {
  switch (key) {
    case 'slug': return link.slug
    case 'destination': return link.url || ''
    case 'comment': return link.comment || ''
    case 'batch': return batchName(link).toLowerCase()
    case 'created': return link.createdAt ?? 0
    case 'clicks': return counters(link)?.visits ?? -1
    case 'visitors': return counters(link)?.visitors ?? -1
  }
}

function sortLinks(arr: Link[]): Link[] {
  const dir = sortDir.value === 'asc' ? 1 : -1
  return [...arr].sort((a, b) => {
    const va = sortValue(a, sortKey.value)
    const vb = sortValue(b, sortKey.value)
    if (typeof va === 'number' && typeof vb === 'number')
      return (va - vb) * dir
    return String(va).localeCompare(String(vb)) * dir
  })
}

function setSort(key: SortKey) {
  if (sortKey.value === key)
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else {
    sortKey.value = key
    // sensible default direction per column
    sortDir.value = (key === 'created' || key === 'clicks' || key === 'visitors') ? 'desc' : 'asc'
  }
}

// ── Group + sort pipeline ──────────────────────────────────────────────────
interface RowGroup { key: string, label: string, links: Link[] }

const groups = computed<RowGroup[]>(() => {
  const sorted = sortLinks(links.value)
  if (groupBy.value === 'none')
    return [{ key: '__all', label: '', links: sorted }]

  const buckets = new Map<string, Link[]>()
  for (const link of sorted) {
    let label: string
    if (groupBy.value === 'batch')
      label = batchName(link) || (link.batchId ? '(deleted batch)' : 'No batch')
    else if (groupBy.value === 'created')
      label = formatDate(link.createdAt)
    else
      label = link.comment?.trim() || 'No comment'

    if (!buckets.has(label))
      buckets.set(label, [])
    buckets.get(label)!.push(link)
  }

  const result: RowGroup[] = Array.from(buckets, ([label, groupLinks]) => ({ key: label, label, links: groupLinks }))

  // Order the groups themselves
  result.sort((a, b) => {
    // push the "No …" / deleted bucket to the end
    const aEmpty = a.label.startsWith('No ') || a.label === '(deleted batch)'
    const bEmpty = b.label.startsWith('No ') || b.label === '(deleted batch)'
    if (aEmpty !== bEmpty)
      return aEmpty ? 1 : -1
    if (groupBy.value === 'created') {
      // newest day first
      const ad = a.links[0]?.createdAt ?? 0
      const bd = b.links[0]?.createdAt ?? 0
      return bd - ad
    }
    return a.label.localeCompare(b.label)
  })
  return result
})

const totalShown = computed(() => links.value.length)

</script>

<template>
  <div class="space-y-3">
    <!-- Toolbar: group by -->
    <div class="flex flex-wrap items-center gap-2 text-sm">
      <span class="text-muted-foreground">Group by:</span>
      <div class="flex items-center rounded-md border overflow-hidden">
        <button
          v-for="opt in (['none', 'batch', 'created', 'comment'] as GroupBy[])"
          :key="opt"
          type="button"
          class="px-2.5 py-1 capitalize transition-colors border-l first:border-l-0"
          :class="groupBy === opt ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'"
          @click="groupBy = opt"
        >
          {{ opt === 'none' ? 'None' : opt }}
        </button>
      </div>
      <span class="text-muted-foreground ml-auto text-xs">{{ totalShown }} loaded</span>
    </div>

    <div class="rounded-lg border overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-muted/50">
            <tr>
              <DashboardSortableTh label="Slug" sort-key="slug" :active="sortKey" :dir="sortDir" @sort="setSort" />
              <DashboardSortableTh label="Destination" sort-key="destination" :active="sortKey" :dir="sortDir" @sort="setSort" />
              <DashboardSortableTh label="Clicks" sort-key="clicks" align="right" :active="sortKey" :dir="sortDir" @sort="setSort" />
              <DashboardSortableTh label="Visitors" sort-key="visitors" align="right" :active="sortKey" :dir="sortDir" @sort="setSort" />
              <DashboardSortableTh label="Comment" sort-key="comment" :active="sortKey" :dir="sortDir" @sort="setSort" />
              <DashboardSortableTh label="Batch" sort-key="batch" :active="sortKey" :dir="sortDir" @sort="setSort" />
              <DashboardSortableTh label="Created" sort-key="created" :active="sortKey" :dir="sortDir" @sort="setSort" />
              <th class="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>

          <tbody>
            <template v-for="group in groups" :key="group.key">
              <!-- group header -->
              <tr v-if="groupBy !== 'none'" class="bg-muted/30 border-t">
                <td colspan="8" class="px-4 py-2 text-xs font-semibold text-muted-foreground">
                  {{ group.label }}
                  <span class="font-normal">· {{ group.links.length }}</span>
                </td>
              </tr>

              <tr
                v-for="link in group.links"
                :key="link.id"
                class="border-t hover:bg-muted/30 transition-colors"
              >
                <td class="px-4 py-2.5">
                  <NuxtLink
                    :to="{ path: '/dashboard/link', query: { slug: link.slug } }"
                    class="font-mono text-xs text-primary hover:underline"
                  >
                    {{ link.slug }}
                  </NuxtLink>
                </td>
                <td class="px-4 py-2.5 max-w-[220px]">
                  <span class="block truncate text-xs text-muted-foreground" :title="link.url">{{ link.url }}</span>
                </td>
                <td class="px-4 py-2.5 text-right tabular-nums text-xs">
                  <span v-if="counters(link)">{{ counters(link)!.visits.toLocaleString() }}</span>
                  <span v-else class="text-muted-foreground">—</span>
                </td>
                <td class="px-4 py-2.5 text-right tabular-nums text-xs">
                  <span v-if="counters(link)">{{ counters(link)!.visitors.toLocaleString() }}</span>
                  <span v-else class="text-muted-foreground">—</span>
                </td>
                <td class="px-4 py-2.5 text-xs text-muted-foreground max-w-[160px]">
                  <span class="block truncate" :title="link.comment">{{ link.comment || '—' }}</span>
                </td>
                <td class="px-4 py-2.5 text-xs max-w-[160px]">
                  <NuxtLink
                    v-if="link.batchId && batchName(link)"
                    :to="`/dashboard/batches/${link.batchId}`"
                    class="block truncate text-primary hover:underline"
                    :title="batchName(link)"
                  >
                    {{ batchName(link) }}
                  </NuxtLink>
                  <span v-else class="text-muted-foreground">—</span>
                </td>
                <td class="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                  {{ formatDate(link.createdAt) }}
                </td>
                <td class="px-4 py-2.5">
                  <div class="flex items-center justify-end">
                    <DashboardLinksActions :link="link" />
                  </div>
                </td>
              </tr>
            </template>

            <tr v-if="pending && links.length === 0">
              <td colspan="8" class="px-4 py-10 text-center text-sm text-muted-foreground">Loading…</td>
            </tr>
            <tr v-else-if="!pending && links.length === 0">
              <td colspan="8" class="px-4 py-10 text-center text-sm text-muted-foreground">No links yet.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="!listComplete && links.length > 0" class="border-t bg-muted/20 px-4 py-2.5 text-center">
        <button
          type="button"
          class="text-xs text-primary hover:underline disabled:opacity-50"
          :disabled="pending"
          @click="loadLinks(false)"
        >
          {{ pending ? 'Loading…' : 'Load more' }}
        </button>
      </div>
    </div>

    <p v-if="groupBy !== 'none' || sortKey !== 'created'" class="text-xs text-muted-foreground">
      Sorting and grouping apply to the {{ totalShown }} links loaded so far. Use “Load more” to include the rest.
    </p>
  </div>
</template>