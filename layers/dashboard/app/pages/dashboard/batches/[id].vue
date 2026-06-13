<script setup lang="ts">
import type { Batch } from '#shared/types/batch'

definePageMeta({
  layout: 'dashboard',
})

const route = useRoute()
const config = useRuntimeConfig()
const batchId = route.params.id as string

const batch = ref<Batch | null>(null)
const links = ref<any[]>([])
const pending = ref(false)
const error = ref('')
const truncated = ref(false)

async function load() {
  pending.value = true
  error.value = ''
  try {
    batch.value = await useAPI<Batch>(`/api/batch/${batchId}`)

    // Collect links belonging to this batch by paging through the existing
    // /api/link/list endpoint and filtering client-side. Capped to keep the
    // dashboard responsive; CSV export covers the full set if ever needed.
    const collected: any[] = []
    let cursor: string | undefined
    let pages = 0
    const MAX_PAGES = 20 // 20 × 1024 = up to ~20k links scanned

    do {
      const data = await useAPI<{ links: any[], cursor?: string, list_complete: boolean }>('/api/link/list', {
        query: { limit: 1024, ...(cursor ? { cursor } : {}) },
      })
      for (const l of data.links ?? []) {
        if (l.batchId === batchId)
          collected.push(l)
      }
      cursor = data.cursor
      pages++
      if (data.list_complete) { cursor = undefined; break }
      if (pages >= MAX_PAGES) { truncated.value = true; break }
    } while (cursor)

    links.value = collected
  }
  catch (e: any) {
    error.value = e?.statusMessage || e?.data?.statusText || 'Failed to load batch'
  }
  finally {
    pending.value = false
  }
}
onMounted(load)

function formatDate(unix?: number) {
  if (!unix)
    return '—'
  return new Date(unix * 1000).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function exportCsv() {
  const header = ['slug', 'url', 'comment', 'createdAt']
  const lines = [
    header.join(','),
    ...links.value.map(l => [
      l.slug,
      `"${(l.url || '').replace(/"/g, '""')}"`,
      `"${(l.comment || '').replace(/"/g, '""')}"`,
      formatDate(l.createdAt),
    ].join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `batch-${batch.value?.name ?? batchId}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <main class="space-y-6">
    <NuxtLink to="/dashboard/batches" class="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
      ← All Batches
    </NuxtLink>

    <div v-if="pending" class="flex justify-center py-16 text-sm text-muted-foreground">
      Loading…
    </div>

    <div v-else-if="error" class="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-center">
      <p class="text-sm text-destructive">{{ error }}</p>
    </div>

    <template v-else-if="batch">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold">{{ batch.name }}</h1>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-muted-foreground">
            <span>{{ batch.count.toLocaleString() }} links</span>
            <span>·</span>
            <span>Created {{ formatDate(batch.createdAt) }}</span>
            <template v-if="batch.comment">
              <span>·</span>
              <span>{{ batch.comment }}</span>
            </template>
          </div>
        </div>
        <button
          type="button"
          class="text-sm rounded-md border px-3 py-1.5 hover:bg-muted transition-colors shrink-0"
          @click="exportCsv"
        >
          Export CSV
        </button>
      </div>

      <div v-if="truncated" class="rounded-md bg-muted px-4 py-2.5 text-xs text-muted-foreground">
        Showing the first {{ links.length.toLocaleString() }} links found (scan capped for performance).
      </div>

      <div v-if="links.length" class="rounded-lg border overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-muted/50">
              <tr>
                <th class="px-4 py-3 text-left font-medium text-muted-foreground">Slug</th>
                <th class="px-4 py-3 text-left font-medium text-muted-foreground">Destination</th>
                <th class="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Comment</th>
                <th class="px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell">Created</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="link in links" :key="link.slug" class="border-t hover:bg-muted/30 transition-colors">
                <td class="px-4 py-2.5">
                  <NuxtLink
                    :to="{ path: '/dashboard/link', query: { slug: link.slug } }"
                    class="font-mono text-xs text-primary hover:underline"
                  >
                    {{ link.slug }}
                  </NuxtLink>
                </td>
                <td class="px-4 py-2.5 max-w-xs">
                  <span class="block truncate text-xs text-muted-foreground" :title="link.url">{{ link.url }}</span>
                </td>
                <td class="px-4 py-2.5 text-xs text-muted-foreground hidden md:table-cell">{{ link.comment || '—' }}</td>
                <td class="px-4 py-2.5 text-xs text-muted-foreground hidden sm:table-cell">{{ formatDate(link.createdAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-else class="rounded-lg border border-dashed p-10 text-center">
        <p class="text-sm text-muted-foreground">No links found in this batch.</p>
      </div>
    </template>
  </main>
</template>
