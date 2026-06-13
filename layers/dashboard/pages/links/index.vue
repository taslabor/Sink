<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

// ── View mode persisted in localStorage ───────────────────────────────────
const viewMode = useLocalStorage<'card' | 'table'>('links-view-mode', 'card')

// ── Fetch links (same pattern as original page) ───────────────────────────
const limit = 20
const cursor = ref<string | undefined>(undefined)
const links = ref<any[]>([])
const listComplete = ref(false)
const pending = ref(true)

async function fetchLinks(reset = false) {
  if (reset) {
    links.value = []
    cursor.value = undefined
    listComplete.value = false
  }
  pending.value = true
  try {
    const params: Record<string, any> = { limit }
    if (cursor.value) params.cursor = cursor.value

    const data = await $fetch<{ links: any[], cursor?: string, list_complete: boolean }>('/api/link/list', { params })
    links.value = reset ? (data.links ?? []) : [...links.value, ...(data.links ?? [])]
    cursor.value = data.cursor
    listComplete.value = data.list_complete ?? false
  }
  finally {
    pending.value = false
  }
}

await fetchLinks(true)

function loadMore() {
  if (!listComplete.value && !pending.value) fetchLinks()
}

// ── Helpers ────────────────────────────────────────────────────────────────
function formatDate(unix: number | undefined) {
  if (!unix) return '—'
  return new Date(unix * 1000).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

const toast = useToast()
function copyLink(slug: string) {
  navigator.clipboard.writeText(`${useRuntimeConfig().public.siteUrl}/${slug}`)
  toast.add({ title: 'Copied', color: 'green' })
}
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 py-8 space-y-5">
    <!-- Header + controls -->
    <div class="flex items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold">
        Links
      </h1>
      <div class="flex items-center gap-2">
        <!-- Bulk create shortcut -->
        <NuxtLink to="/dashboard/bulk-create">
          <UButton variant="outline" size="sm">
            Bulk Create
          </UButton>
        </NuxtLink>

        <!-- View mode toggle -->
        <div class="flex items-center rounded-md border overflow-hidden">
          <button
            class="px-2.5 py-1.5 transition-colors"
            :class="viewMode === 'card' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'"
            title="Card view"
            @click="viewMode = 'card'"
          >
            <UIcon name="i-lucide-layout-grid" class="w-4 h-4" />
          </button>
          <button
            class="px-2.5 py-1.5 transition-colors border-l"
            :class="viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'"
            title="Table view"
            @click="viewMode = 'table'"
          >
            <UIcon name="i-lucide-table" class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>

    <!-- Loading spinner (initial load) -->
    <div v-if="pending && links.length === 0" class="flex justify-center py-20">
      <UIcon name="i-lucide-loader-2" class="animate-spin text-muted-foreground w-6 h-6" />
    </div>

    <!-- Empty state -->
    <div v-else-if="!pending && links.length === 0" class="rounded-lg border border-dashed p-14 text-center">
      <UIcon name="i-lucide-link" class="w-8 h-8 text-muted-foreground mx-auto mb-3" />
      <h2 class="font-medium text-base mb-1">
        No links yet
      </h2>
      <p class="text-sm text-muted-foreground">
        Create your first link or use Bulk Create to import many at once.
      </p>
    </div>

    <!-- ── CARD VIEW (original layout preserved) ────────────────────────── -->
    <div v-else-if="viewMode === 'card'" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="link in links"
        :key="link.slug"
        class="rounded-lg border bg-card p-4 space-y-2 hover:shadow-sm transition-shadow"
      >
        <div class="flex items-start justify-between gap-2">
          <NuxtLink :to="`/dashboard/link/${link.slug}`" class="font-mono text-sm text-primary hover:underline font-medium truncate">
            {{ link.slug }}
          </NuxtLink>
          <button class="text-muted-foreground hover:text-foreground shrink-0" @click="copyLink(link.slug)">
            <UIcon name="i-lucide-copy" class="w-3.5 h-3.5" />
          </button>
        </div>
        <p class="text-xs text-muted-foreground truncate" :title="link.url">
          {{ link.url }}
        </p>
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{{ formatDate(link.createdAt) }}</span>
          <template v-if="link.batchId">
            <span>·</span>
            <NuxtLink :to="`/dashboard/batches/${link.batchId}`" class="text-primary hover:underline" @click.stop>
              Batch
            </NuxtLink>
          </template>
        </div>
      </div>
    </div>

    <!-- ── TABLE VIEW ───────────────────────────────────────────────────── -->
    <div v-else class="rounded-lg border overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-muted/50">
          <tr>
            <th class="px-4 py-3 text-left font-medium text-muted-foreground">Slug</th>
            <th class="px-4 py-3 text-left font-medium text-muted-foreground">Destination</th>
            <th class="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Comment</th>
            <th class="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">Batch</th>
            <th class="px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell">Created</th>
            <th class="px-4 py-3 w-10" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="link in links"
            :key="link.slug"
            class="border-t hover:bg-muted/30 transition-colors"
          >
            <td class="px-4 py-2.5">
              <NuxtLink :to="`/dashboard/link/${link.slug}`" class="font-mono text-xs text-primary hover:underline">
                {{ link.slug }}
              </NuxtLink>
            </td>
            <td class="px-4 py-2.5 max-w-xs">
              <span class="text-xs text-muted-foreground truncate block" :title="link.url">{{ link.url }}</span>
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
            <td class="px-3 py-2.5">
              <button class="text-muted-foreground hover:text-foreground" @click="copyLink(link.slug)">
                <UIcon name="i-lucide-copy" class="w-3.5 h-3.5" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Load more -->
    <div v-if="!listComplete && links.length > 0" class="flex justify-center pt-2">
      <UButton variant="outline" size="sm" :loading="pending" @click="loadMore">
        Load more
      </UButton>
    </div>
  </div>
</template>
