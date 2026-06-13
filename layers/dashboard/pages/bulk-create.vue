<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const { t } = useI18n()
const toast = useToast()

// ── State ──────────────────────────────────────────────────────────────────
type LinkRow = { url: string, slug: string, comment: string, error?: string }

const activeTab = ref<'paste' | 'csv'>('paste')
const batchName = ref('')
const batchComment = ref('')
const rows = ref<LinkRow[]>(emptyRows(5))
const isSubmitting = ref(false)
const submitResult = ref<{ batch: any, results: any[] } | null>(null)

// CSV drag state
const isDragging = ref(false)
const csvFileName = ref('')

// ── Paste table helpers ────────────────────────────────────────────────────
function emptyRows(n: number): LinkRow[] {
  return Array.from({ length: n }, () => ({ url: '', slug: '', comment: '' }))
}

function addRow() {
  rows.value.push({ url: '', slug: '', comment: '' })
}

function removeRow(index: number) {
  rows.value.splice(index, 1)
}

function handlePaste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData('text')
  if (!text) return

  // If pasting into a cell, let the browser handle it normally
  const target = event.target as HTMLElement
  if (target.tagName === 'INPUT') return

  event.preventDefault()
  parseTabSeparated(text)
}

function parseTabSeparated(text: string) {
  const lines = text.trim().split('\n')
  const parsed: LinkRow[] = []

  for (const line of lines) {
    const cols = line.split('\t').map(c => c.trim())
    if (cols.length >= 1 && cols[0]) {
      parsed.push({
        url: cols[0] || '',
        slug: cols[1] || '',
        comment: cols[2] || '',
      })
    }
  }

  if (parsed.length > 0) {
    // Replace empty rows with pasted content
    const nonEmpty = rows.value.filter(r => r.url || r.slug || r.comment)
    rows.value = [...nonEmpty, ...parsed]
    toast.add({ title: `Pasted ${parsed.length} row${parsed.length !== 1 ? 's' : ''}`, color: 'green' })
  }
}

// ── CSV handling ───────────────────────────────────────────────────────────
function onDragOver(e: DragEvent) { e.preventDefault(); isDragging.value = true }
function onDragLeave() { isDragging.value = false }

function onDrop(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) processFile(file)
}

function onFileInput(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) processFile(file)
}

function processFile(file: File) {
  if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
    toast.add({ title: 'Please upload a .csv file', color: 'red' })
    return
  }
  csvFileName.value = file.name
  const reader = new FileReader()
  reader.onload = (e) => {
    const text = e.target?.result as string
    parseCsv(text)
  }
  reader.readAsText(file)
}

function parseCsv(text: string) {
  const lines = text.trim().split('\n')
  if (lines.length === 0) return

  // Auto-detect header row: if first cell isn't a URL, treat it as header
  let startIndex = 0
  const firstCell = lines[0].split(',')[0].trim().toLowerCase().replace(/"/g, '')
  if (firstCell === 'url' || firstCell === 'long_url' || firstCell === 'destination') {
    startIndex = 1
  }

  const parsed: LinkRow[] = []
  for (let i = startIndex; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i])
    if (cols.length >= 1 && cols[0]) {
      parsed.push({
        url: cols[0] || '',
        slug: cols[1] || '',
        comment: cols[2] || '',
      })
    }
  }

  rows.value = parsed
  toast.add({ title: `Loaded ${parsed.length} row${parsed.length !== 1 ? 's' : ''} from ${csvFileName.value}`, color: 'green' })
}

// Basic CSV line parser handling quoted fields
function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    }
    else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    }
    else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

// ── Validation ─────────────────────────────────────────────────────────────
const validRows = computed(() =>
  rows.value.filter(r => r.url.trim()),
)

function validateRows(): boolean {
  let valid = true
  rows.value.forEach((row) => {
    row.error = undefined
    if (!row.url.trim()) return
    try { new URL(row.url) }
    catch {
      row.error = 'Invalid URL'
      valid = false
    }
  })
  return valid
}

// ── Submit ─────────────────────────────────────────────────────────────────
async function submit() {
  if (!batchName.value.trim()) {
    toast.add({ title: 'Please enter a batch name', color: 'red' })
    return
  }
  if (validRows.value.length === 0) {
    toast.add({ title: 'No valid URLs to submit', color: 'red' })
    return
  }
  if (!validateRows()) {
    toast.add({ title: 'Fix invalid URLs before submitting', color: 'red' })
    return
  }

  isSubmitting.value = true
  submitResult.value = null

  try {
    const linksPayload = validRows.value.map(r => ({
      url: r.url.trim(),
      ...(r.slug.trim() ? { slug: r.slug.trim() } : {}),
      ...(r.comment.trim() ? { comment: r.comment.trim() } : {}),
    }))

    const data = await $fetch('/api/link/bulk', {
      method: 'POST',
      body: {
        batchName: batchName.value.trim(),
        batchComment: batchComment.value.trim() || undefined,
        links: linksPayload,
      },
    })

    submitResult.value = data as any
    const successCount = (data as any).results.filter((r: any) => r.success).length
    toast.add({
      title: `Batch created: ${successCount} of ${linksPayload.length} links created`,
      color: successCount === linksPayload.length ? 'green' : 'yellow',
    })
  }
  catch (err: any) {
    toast.add({ title: err?.data?.message || 'Batch creation failed', color: 'red' })
  }
  finally {
    isSubmitting.value = false
  }
}

function reset() {
  rows.value = emptyRows(5)
  batchName.value = ''
  batchComment.value = ''
  csvFileName.value = ''
  submitResult.value = null
}
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 py-8 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold">
          Bulk Create Links
        </h1>
        <p class="text-sm text-muted-foreground mt-1">
          Upload a CSV or paste rows from a spreadsheet to create links in bulk.
        </p>
      </div>
      <NuxtLink to="/dashboard/batches">
        <UButton variant="outline" size="sm">
          View Batches
        </UButton>
      </NuxtLink>
    </div>

    <!-- Result panel (shown after submit) -->
    <div v-if="submitResult" class="rounded-lg border bg-card p-5 space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="font-semibold text-base">
          Batch created: {{ submitResult.batch.name }}
        </h2>
        <div class="flex gap-2">
          <NuxtLink :to="`/dashboard/batches/${submitResult.batch.id}`">
            <UButton size="sm" variant="outline">
              View Batch
            </UButton>
          </NuxtLink>
          <UButton size="sm" @click="reset">
            Create Another
          </UButton>
        </div>
      </div>

      <!-- Success/failure summary -->
      <div class="text-sm text-muted-foreground">
        {{ submitResult.results.filter(r => r.success).length }} created ·
        {{ submitResult.results.filter(r => !r.success).length }} failed
      </div>

      <!-- Failure details if any -->
      <div v-if="submitResult.results.some(r => !r.success)" class="space-y-1">
        <p class="text-sm font-medium text-destructive">
          Failed rows:
        </p>
        <div
          v-for="(result, i) in submitResult.results.filter(r => !r.success)"
          :key="i"
          class="text-xs bg-destructive/10 rounded px-3 py-1.5 font-mono"
        >
          {{ result.url }} — {{ result.error }}
        </div>
      </div>
    </div>

    <!-- Main form (hidden after successful submit) -->
    <template v-else>
      <!-- Batch metadata -->
      <div class="rounded-lg border bg-card p-5 space-y-4">
        <h2 class="font-medium text-sm uppercase tracking-wide text-muted-foreground">
          Batch Details
        </h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="space-y-1.5">
            <label class="text-sm font-medium">Batch Name <span class="text-destructive">*</span></label>
            <UInput v-model="batchName" placeholder="e.g. Campaign — June 2026" class="w-full" />
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium">Comment <span class="text-muted-foreground font-normal">(optional)</span></label>
            <UInput v-model="batchComment" placeholder="Internal notes about this batch" class="w-full" />
          </div>
        </div>
      </div>

      <!-- Tab switcher -->
      <div class="flex gap-2 border-b">
        <button
          class="pb-2 px-1 text-sm font-medium border-b-2 transition-colors"
          :class="activeTab === 'paste' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'paste'"
        >
          Paste Table
        </button>
        <button
          class="pb-2 px-1 text-sm font-medium border-b-2 transition-colors"
          :class="activeTab === 'csv' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'csv'"
        >
          Upload CSV
        </button>
      </div>

      <!-- Paste table tab -->
      <div v-if="activeTab === 'paste'" class="space-y-3" @paste="handlePaste">
        <p class="text-xs text-muted-foreground">
          Type or paste directly from Excel/Google Sheets. Columns: <code class="bg-muted px-1 rounded">URL</code> <code class="bg-muted px-1 rounded">Slug (optional)</code> <code class="bg-muted px-1 rounded">Comment (optional)</code>
        </p>

        <div class="rounded-lg border overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-muted/50">
              <tr>
                <th class="px-3 py-2 text-left font-medium text-muted-foreground w-8">#</th>
                <th class="px-3 py-2 text-left font-medium">URL <span class="text-destructive">*</span></th>
                <th class="px-3 py-2 text-left font-medium w-40">Slug</th>
                <th class="px-3 py-2 text-left font-medium w-52">Comment</th>
                <th class="px-3 py-2 w-10" />
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, index) in rows"
                :key="index"
                :class="row.error ? 'bg-destructive/5' : 'hover:bg-muted/30'"
                class="border-t"
              >
                <td class="px-3 py-1.5 text-muted-foreground text-xs">
                  {{ index + 1 }}
                </td>
                <td class="px-2 py-1">
                  <div class="space-y-0.5">
                    <input
                      v-model="row.url"
                      type="url"
                      placeholder="https://example.com/long-url"
                      class="w-full bg-transparent outline-none focus:ring-1 focus:ring-primary rounded px-1.5 py-0.5 text-sm min-w-[240px]"
                      :class="row.error ? 'ring-1 ring-destructive' : ''"
                    >
                    <p v-if="row.error" class="text-xs text-destructive px-1.5">
                      {{ row.error }}
                    </p>
                  </div>
                </td>
                <td class="px-2 py-1">
                  <input
                    v-model="row.slug"
                    type="text"
                    placeholder="auto-generated"
                    class="w-full bg-transparent outline-none focus:ring-1 focus:ring-primary rounded px-1.5 py-0.5 text-sm"
                  >
                </td>
                <td class="px-2 py-1">
                  <input
                    v-model="row.comment"
                    type="text"
                    placeholder=""
                    class="w-full bg-transparent outline-none focus:ring-1 focus:ring-primary rounded px-1.5 py-0.5 text-sm"
                  >
                </td>
                <td class="px-2 py-1 text-center">
                  <button
                    class="text-muted-foreground hover:text-destructive transition-colors"
                    title="Remove row"
                    @click="removeRow(index)"
                  >
                    ×
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="flex items-center gap-3">
          <UButton variant="outline" size="sm" @click="addRow">
            + Add row
          </UButton>
          <span class="text-xs text-muted-foreground">
            {{ validRows.length }} valid URL{{ validRows.length !== 1 ? 's' : '' }}
          </span>
        </div>
      </div>

      <!-- CSV upload tab -->
      <div v-if="activeTab === 'csv'" class="space-y-4">
        <p class="text-xs text-muted-foreground">
          CSV columns (header row optional): <code class="bg-muted px-1 rounded">url</code>, <code class="bg-muted px-1 rounded">slug</code>, <code class="bg-muted px-1 rounded">comment</code>
        </p>

        <!-- Drop zone -->
        <div
          class="border-2 border-dashed rounded-lg p-10 text-center transition-colors cursor-pointer"
          :class="isDragging ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/50'"
          @dragover="onDragOver"
          @dragleave="onDragLeave"
          @drop="onDrop"
          @click="($refs.fileInput as HTMLInputElement).click()"
        >
          <input
            ref="fileInput"
            type="file"
            accept=".csv,text/csv"
            class="hidden"
            @change="onFileInput"
          >
          <div v-if="csvFileName" class="space-y-1">
            <p class="text-sm font-medium">
              {{ csvFileName }}
            </p>
            <p class="text-xs text-muted-foreground">
              {{ rows.length }} rows loaded — click to replace
            </p>
          </div>
          <div v-else>
            <p class="text-sm text-muted-foreground">
              Drop a CSV file here, or click to browse
            </p>
            <p class="text-xs text-muted-foreground mt-1">
              .csv files only
            </p>
          </div>
        </div>

        <!-- Preview table after CSV load -->
        <div v-if="rows.length > 0 && csvFileName" class="rounded-lg border overflow-hidden">
          <div class="bg-muted/50 px-3 py-2 flex items-center justify-between">
            <span class="text-xs font-medium text-muted-foreground">Preview (first 10 rows)</span>
            <span class="text-xs text-muted-foreground">{{ rows.length }} total rows</span>
          </div>
          <table class="w-full text-sm">
            <thead class="bg-muted/30">
              <tr>
                <th class="px-3 py-1.5 text-left font-medium text-xs text-muted-foreground">URL</th>
                <th class="px-3 py-1.5 text-left font-medium text-xs text-muted-foreground">Slug</th>
                <th class="px-3 py-1.5 text-left font-medium text-xs text-muted-foreground">Comment</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, i) in rows.slice(0, 10)"
                :key="i"
                class="border-t hover:bg-muted/20"
              >
                <td class="px-3 py-1.5 truncate max-w-xs text-xs font-mono">{{ row.url }}</td>
                <td class="px-3 py-1.5 text-xs font-mono text-muted-foreground">{{ row.slug || '—' }}</td>
                <td class="px-3 py-1.5 text-xs text-muted-foreground">{{ row.comment || '—' }}</td>
              </tr>
              <tr v-if="rows.length > 10" class="border-t">
                <td colspan="3" class="px-3 py-1.5 text-xs text-muted-foreground text-center">
                  … and {{ rows.length - 10 }} more rows
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Submit bar -->
      <div class="flex items-center gap-4 pt-2">
        <UButton
          :loading="isSubmitting"
          :disabled="validRows.length === 0 || !batchName.trim()"
          @click="submit"
        >
          Create {{ validRows.length > 0 ? validRows.length : '' }} Link{{ validRows.length !== 1 ? 's' : '' }}
        </UButton>
        <span class="text-xs text-muted-foreground">
          Requires a batch name and at least one URL.
        </span>
      </div>
    </template>
  </div>
</template>
