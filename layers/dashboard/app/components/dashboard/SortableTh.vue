<script setup lang="ts">
// Auto-imported as <DashboardSortableTh /> (path: dashboard/SortableTh.vue)
// A clickable <th> that shows the active sort direction.

const props = defineProps<{
  label: string
  sortKey: string
  active: string
  dir: 'asc' | 'desc'
  align?: 'left' | 'right'
}>()

const emit = defineEmits<{ sort: [key: string] }>()

const isActive = computed(() => props.active === props.sortKey)
</script>

<template>
  <th
    class="px-4 py-3 font-medium text-muted-foreground select-none cursor-pointer hover:text-foreground transition-colors"
    :class="align === 'right' ? 'text-right' : 'text-left'"
    @click="emit('sort', sortKey)"
  >
    <span class="inline-flex items-center gap-1" :class="align === 'right' ? 'flex-row-reverse' : ''">
      {{ label }}
      <svg
        v-if="isActive"
        xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
        :class="dir === 'asc' ? 'rotate-180' : ''"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
      <span v-else class="w-3" />
    </span>
  </th>
</template>
