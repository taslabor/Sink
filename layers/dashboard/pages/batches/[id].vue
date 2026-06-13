<script setup lang="ts">
import type { Batch } from '~/shared/types/batch'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const batchId = route.params.id as string

const { data, pending, error } = await useFetch<{
  batch: Batch
  links: any[]
  cursor?: string
  list_complete: boolean
}>(`/api/batch/${batchId}/links`)

const batch = computed(() => data.value?.batch)
const links = computed(() => data.value?.links ?? [])

function formatDate(unix: number | undefined) {
  if (!unix) return '—'
  return new Date(unix * 1000).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text)
}

// Export links as CSV
function exportCsv() {
  const header = ['slug', 'url', 'comment', 'createdAt']
  const csvRows = [
    header.join(','),
    ...links.value.map(link =>
      [
        link.slug,
        `"${link.url}"`,
        `"${link.comment || ''}"`,
        formatDate(link.createdAt),
      ].join(','),
    ),
  ]
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `batch-${batch.value?.name ?? batchId}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 py-8 space-y-6">
    <!-- Back link -->
    <NuxtLink to="/dashboard/batches" class="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
      <UIcon name="i-lucide-arrow-left" class="w-3.5 h-3.5" />
      All Batches
    </NuxtLink>

    <!-- Loading -->
    <div v-if="pending" class="flex justify-center py-16">
      <UIcon name="i-lucide-loader-2" class="animate-spin text-muted-foreground w-6 h-6" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-center">
      <p class="text-sm text-destructive">
        Batch not found or failed to load.
      </p>
    </div>

    <template v-else-if="batch">
      <!-- Batch header -->
      <div class="flex items-start justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold">
            {{ batch.name }}
          </h1>
          <div class="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            <span>{{ batch.count.toLocaleString() }} links</span>
            <span>·</span>
            <span>Created {{ formatDate(batch.createdAt) }}</span>
            <template v-if="batch.comment">
              <span>·</span>
              <span>{{ batch.comment }}</span>
            </template>
          </div>
        </div>
        <UButton variant="outline" size="sm" @click="exportCsv">
          Export CSV
        </UButton>
      </div>

      <!-- Links table -->
      <div v-if="links.length > 0" class="rounded-lg border overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-muted/50">
            <tr>
              <th class="px-4 py-3 text-left font-medium text-muted-foreground">Slug</th>
              <th class="px-4 py-3 text-left font-medium text-muted-foreground">Destination URL</th>
              <th class="px-4 py-3 text-left font-medium text-muted-foreground">Comment</th>
              <th class="px-4 py-3 text-left font-medium text-muted-foreground">Created</th>
              <th class="px-4 py-3 w-8" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="link in links"
              :key="link.slug"
              class="border-t hover:bg-muted/30 transition-colors"
            >
              <td class="px-4 py-2.5 font-mono text-xs">
                <NuxtLink
                  :to="`/dashboard/link/${link.slug}`"
                  class="text-primary hover:underline"
                >
                  {{ link.slug }}
                </NuxtLink>
              </td>
              <td class="px-4 py-2.5 text-muted-foreground max-w-xs">
                <span class="truncate block text-xs" :title="link.url">{{ link.url }}</span>
              </td>
              <td class="px-4 py-2.5 text-xs text-muted-foreground">
                {{ link.comment || '—' }}
              </td>
              <td class="px-4 py-2.5 text-xs text-muted-foreground">
                {{ formatDate(link.createdAt) }}
              </td>
              <td class="px-3 py-2.5">
                <button
                  class="text-muted-foreground hover:text-foreground transition-colors"
                  title="Copy short link"
                  @click="copyToClipboard(`${$config.public.siteUrl}/${link.slug}`)"
                >
                  <UIcon name="i-lucide-copy" class="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Pagination note if not all loaded -->
        <div v-if="!data?.list_complete" class="bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground border-t">
          Showing first {{ links.length }} links. Full list available via CSV export.
        </div>
      </div>

      <!-- Empty state (shouldn't normally happen) -->
      <div v-else class="rounded-lg border border-dashed p-10 text-center">
        <p class="text-sm text-muted-foreground">
          No links found in this batch.
        </p>
      </div>
    </template>
  </div>
</template>
