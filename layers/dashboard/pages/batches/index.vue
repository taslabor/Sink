<script setup lang="ts">
import type { Batch } from '~/shared/types/batch'

definePageMeta({ layout: 'dashboard' })

const { data, pending, refresh } = await useFetch<{ batches: Batch[], list_complete: boolean }>('/api/batch')

const batches = computed(() => data.value?.batches ?? [])

function formatDate(unix: number) {
  return new Date(unix * 1000).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-8 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold">
          Batches
        </h1>
        <p class="text-sm text-muted-foreground mt-1">
          Groups of links created together via bulk import.
        </p>
      </div>
      <NuxtLink to="/dashboard/bulk-create">
        <UButton size="sm">
          + Bulk Create
        </UButton>
      </NuxtLink>
    </div>

    <!-- Loading -->
    <div v-if="pending" class="flex justify-center py-16">
      <UIcon name="i-lucide-loader-2" class="animate-spin text-muted-foreground w-6 h-6" />
    </div>

    <!-- Empty state -->
    <div v-else-if="batches.length === 0" class="rounded-lg border border-dashed p-12 text-center">
      <UIcon name="i-lucide-layers" class="w-8 h-8 text-muted-foreground mx-auto mb-3" />
      <h2 class="font-medium text-base mb-1">
        No batches yet
      </h2>
      <p class="text-sm text-muted-foreground mb-4">
        Use Bulk Create to generate multiple links at once and group them into a batch.
      </p>
      <NuxtLink to="/dashboard/bulk-create">
        <UButton size="sm">Create your first batch</UButton>
      </NuxtLink>
    </div>

    <!-- Batch list -->
    <div v-else class="rounded-lg border overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-muted/50">
          <tr>
            <th class="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
            <th class="px-4 py-3 text-left font-medium text-muted-foreground">Links</th>
            <th class="px-4 py-3 text-left font-medium text-muted-foreground">Created</th>
            <th class="px-4 py-3 text-left font-medium text-muted-foreground">Comment</th>
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
            <td class="px-4 py-3 font-medium">
              {{ batch.name }}
            </td>
            <td class="px-4 py-3 text-muted-foreground tabular-nums">
              {{ batch.count.toLocaleString() }}
            </td>
            <td class="px-4 py-3 text-muted-foreground">
              {{ formatDate(batch.createdAt) }}
            </td>
            <td class="px-4 py-3 text-muted-foreground text-xs truncate max-w-xs">
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
  </div>
</template>
