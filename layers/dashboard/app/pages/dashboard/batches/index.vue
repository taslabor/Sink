<script setup lang="ts">
import type { Batch } from '#shared/types/batch'

definePageMeta({
  layout: 'dashboard',
})

const batches = ref<Batch[]>([])
const pending = ref(false)

async function load() {
  pending.value = true
  try {
    const data = await useAPI<{ batches: Batch[] }>('/api/batch')
    batches.value = data.batches ?? []
  }
  finally {
    pending.value = false
  }
}
onMounted(load)

function formatDate(unix: number) {
  return new Date(unix * 1000).toLocaleString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}
</script>

<template>
  <main class="space-y-6">
    <div class="flex items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold">Batches</h1>
        <p class="text-sm text-muted-foreground mt-1">Groups of links created together via bulk import.</p>
      </div>
      <NuxtLink
        to="/dashboard/bulk-create"
        class="text-sm rounded-md bg-primary text-primary-foreground px-3 py-1.5 hover:opacity-90 transition-opacity"
      >
        + Bulk Create
      </NuxtLink>
    </div>

    <div v-if="pending" class="flex justify-center py-16 text-sm text-muted-foreground">
      Loading…
    </div>

    <div v-else-if="batches.length === 0" class="rounded-lg border border-dashed p-12 text-center">
      <h2 class="font-medium mb-1">No batches yet</h2>
      <p class="text-sm text-muted-foreground mb-4">
        Use Bulk Create to generate multiple links at once and group them into a batch.
      </p>
      <NuxtLink
        to="/dashboard/bulk-create"
        class="inline-block text-sm rounded-md bg-primary text-primary-foreground px-3 py-1.5 hover:opacity-90 transition-opacity"
      >
        Create your first batch
      </NuxtLink>
    </div>

    <div v-else class="rounded-lg border overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-muted/50">
          <tr>
            <th class="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
            <th class="px-4 py-3 text-left font-medium text-muted-foreground">Links</th>
            <th class="px-4 py-3 text-left font-medium text-muted-foreground">Created</th>
            <th class="px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell">Comment</th>
            <th class="px-4 py-3 w-16" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="batch in batches"
            :key="batch.id"
            class="border-t hover:bg-muted/30 transition-colors cursor-pointer"
            @click="navigateTo(`/dashboard/batches/${batch.id}`)"
          >
            <td class="px-4 py-3 font-medium">{{ batch.name }}</td>
            <td class="px-4 py-3 text-muted-foreground tabular-nums">{{ batch.count.toLocaleString() }}</td>
            <td class="px-4 py-3 text-muted-foreground">{{ formatDate(batch.createdAt) }}</td>
            <td class="px-4 py-3 text-muted-foreground text-xs truncate max-w-xs hidden sm:table-cell">
              {{ batch.comment || '—' }}
            </td>
            <td class="px-4 py-3 text-right">
              <NuxtLink
                :to="`/dashboard/batches/${batch.id}`"
                class="text-xs text-primary hover:underline"
                @click.stop
              >
                View →
              </NuxtLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </main>
</template>
