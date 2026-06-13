<script setup lang="ts">
// Auto-imported as <DashboardLinksTable />
// Table view of links. Fetches via useAPI against the existing /api/link/list
// endpoint, and reuses <DashboardLinksActions /> for the per-row action cluster
// so behaviour matches the card view exactly.

const links = ref<any[]>([])
const cursor = ref<string | undefined>()
const listComplete = ref(false)
const pending = ref(false)

const linksStore = useDashboardLinksStore()

async function fetchLinks(reset = false) {
  if (reset) {
    links.value = []
    cursor.value = undefined
    listComplete.value = false
  }
  pending.value = true
  try {
    const data = await useAPI<{ links: any[], cursor?: string, list_complete: boolean }>('/api/link/list', {
      query: { limit: 50, ...(cursor.value ? { cursor: cursor.value } : {}) },
    })
    links.value = reset ? (data.links ?? []) : [...links.value, ...(data.links ?? [])]
    cursor.value = data.cursor
    listComplete.value = data.list_complete ?? false
  }
  finally {
    pending.value = false
  }
}

onMounted(() => fetchLinks(true))

// Keep the table in sync with edits/deletes triggered from the actions menu.
linksStore.onLinkUpdate(({ link: updatedLink, type }) => {
  if (type === 'delete') {
    links.value = links.value.filter(l => l.id !== updatedLink.id)
  }
  else if (type === 'edit') {
    const idx = links.value.findIndex(l => l.id === updatedLink.id)
    if (idx !== -1)
      links.value[idx] = { ...links.value[idx], ...updatedLink }
  }
})

function formatDate(unix?: number) {
  if (!unix)
    return '—'
  return new Date(unix * 1000).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}
</script>

<template>
  <div class="rounded-lg border overflow-hidden">
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-muted/50">
          <tr>
            <th class="px-4 py-3 text-left font-medium text-muted-foreground">Slug</th>
            <th class="px-4 py-3 text-left font-medium text-muted-foreground">Destination</th>
            <th class="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Comment</th>
            <th class="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">Batch</th>
            <th class="px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell">Created</th>
            <th class="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="link in links"
            :key="link.slug"
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
            <td class="px-4 py-2.5 max-w-xs">
              <span class="block truncate text-xs text-muted-foreground" :title="link.url">{{ link.url }}</span>
            </td>
            <td class="px-4 py-2.5 text-xs text-muted-foreground hidden md:table-cell truncate max-w-[160px]">
              {{ link.comment || '—' }}
            </td>
            <td class="px-4 py-2.5 text-xs hidden lg:table-cell">
              <NuxtLink
                v-if="link.batchId"
                :to="`/dashboard/batches/${link.batchId}`"
                class="text-primary hover:underline"
              >
                View batch
              </NuxtLink>
              <span v-else class="text-muted-foreground">—</span>
            </td>
            <td class="px-4 py-2.5 text-xs text-muted-foreground hidden sm:table-cell">
              {{ formatDate(link.createdAt) }}
            </td>
            <td class="px-4 py-2.5">
              <div class="flex items-center justify-end">
                <DashboardLinksActions :link="link" />
              </div>
            </td>
          </tr>

          <tr v-if="pending && links.length === 0">
            <td colspan="6" class="px-4 py-10 text-center text-sm text-muted-foreground">Loading…</td>
          </tr>
          <tr v-else-if="!pending && links.length === 0">
            <td colspan="6" class="px-4 py-10 text-center text-sm text-muted-foreground">No links yet.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="!listComplete && links.length > 0" class="border-t bg-muted/20 px-4 py-2.5 text-center">
      <button
        type="button"
        class="text-xs text-primary hover:underline disabled:opacity-50"
        :disabled="pending"
        @click="fetchLinks(false)"
      >
        {{ pending ? 'Loading…' : 'Load more' }}
      </button>
    </div>
  </div>
</template>
