<script setup lang="ts">
definePageMeta({
  layout: 'dashboard',
})

// Persisted view preference using Nuxt's built-in cookie (no extra deps).
const viewMode = useCookie<'card' | 'table'>('sink-links-view', { default: () => 'card' })
</script>

<template>
  <main class="space-y-6">
    <Teleport to="#dashboard-header-actions" defer>
      <DashboardLinksEditor />
      <div
        class="
          flex-1
          sm:hidden
        "
      />

      <!-- View mode toggle -->
      <div class="flex items-center rounded-md border overflow-hidden shrink-0">
        <button
          type="button"
          class="flex items-center justify-center size-8 transition-colors"
          :class="viewMode === 'card' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'"
          title="Card view"
          @click="viewMode = 'card'"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" /></svg>
        </button>
        <button
          type="button"
          class="flex items-center justify-center size-8 border-l transition-colors"
          :class="viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'"
          title="Table view"
          @click="viewMode = 'table'"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18" /><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18" /><path d="M3 15h18" /></svg>
        </button>
      </div>

      <DashboardLinksSort />
      <DashboardLinksSearch
        class="max-sm:w-full"
      />
    </Teleport>

    <!-- Card view is the original component, completely untouched -->
    <DashboardLinks v-if="viewMode === 'card'" />
    <!-- Table view is the new component -->
    <DashboardLinksTable v-else />
  </main>
</template>
