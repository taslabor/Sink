<script setup lang="ts">
definePageMeta({
  layout: 'dashboard',
})

type LinkRow = { url: string, slug: string, comment: string, error?: string }

const activeTab = ref<'paste' | 'csv'>('paste')
const batchName = ref('')
const batchComment = ref('')
const rows = ref<LinkRow[]>(emptyRows(5))
const isSubmitting = ref(false)
const submitResult = ref<{ batch: any, results: any[] } | null>(null)
const status = ref<{ text: string, type: 'info' | 'error' | 'success' } | null>(null)

const isDragging = ref(false)
const csvFileName = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

function emptyRows(n: number): LinkRow[] {
  return Array.from({ length: n }, () => ({ url: '', slug: '', comment: '' }))
}
function flash(text: string, type: 'info' | 'error' | 'success' = 'info') {
  status.value = { text, type }
  setTimeout(() => { status.value = null }, 4000)
}
function addRow() {
  rows.value.push({ url: '', slug: '', comment: '' })
}
function removeRow(i: number) {
  rows.value.splice(i, 1)
}

// ── Paste from spreadsheet (tab-separated) ─────────────────────────────────
function handlePaste(event: ClipboardEvent) {
  const target = event.target as HTMLElement
  if (target.tagName === 'INPUT')
    return // let cell paste behave normally
  const text = event.clipboardData?.getData('text')
  if (!text)
    return
  event.preventDefault()
  const parsed = parseTabSeparated(text)
  if (parsed.length) {
    const nonEmpty = rows.value.filter(r => r.url || r.slug || r.comment)
    rows.value = [...nonEmpty, ...parsed]
    flash(`Pasted ${parsed.length} row${parsed.length !== 1 ? 's' : ''}`, 'success')
  }
}
function parseTabSeparated(text: string): LinkRow[] {
  return text.trim().split('\n').map((line) => {
    const c = line.split('\t').map(x => x.trim())
    return { url: c[0] || '', slug: c[1] || '', comment: c[2] || '' }
  }).filter(r => r.url)
}

// ── CSV upload ─────────────────────────────────────────────────────────────
function onDragOver(e: DragEvent) { e.preventDefault(); isDragging.value = true }
function onDragLeave() { isDragging.value = false }
function onDrop(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file)
    processFile(file)
}
function onFileInput(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file)
    processFile(file)
}
function processFile(file: File) {
  if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
    flash('Please upload a .csv file', 'error')
    return
  }
  csvFileName.value = file.name
  const reader = new FileReader()
  reader.onload = e => parseCsv((e.target?.result as string) || '')
  reader.readAsText(file)
}
function parseCsv(text: string) {
  const lines = text.trim().split('\n')
  if (!lines.length)
    return
  let start = 0
  const firstCell = (lines[0].split(',')[0] || '').trim().toLowerCase().replace(/"/g, '')
  if (['url', 'long_url', 'destination'].includes(firstCell))
    start = 1
  const parsed: LinkRow[] = []
  for (let i = start; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i])
    if (cols[0])
      parsed.push({ url: cols[0] || '', slug: cols[1] || '', comment: cols[2] || '' })
  }
  rows.value = parsed
  flash(`Loaded ${parsed.length} row${parsed.length !== 1 ? 's' : ''} from ${csvFileName.value}`, 'success')
}
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++ }
      else { q = !q }
    }
    else if (ch === ',' && !q) { out.push(cur.trim()); cur = '' }
    else { cur += ch }
  }
  out.push(cur.trim())
  return out
}

// ── Validation + submit ────────────────────────────────────────────────────
const validRows = computed(() => rows.value.filter(r => r.url.trim()))

function validate(): boolean {
  let ok = true
  rows.value.forEach((row) => {
    row.error = undefined
    if (!row.url.trim())
      return
    try { void new URL(row.url) }
    catch { row.error = 'Invalid URL'; ok = false }
  })
  return ok
}

async function submit() {
  if (!batchName.value.trim()) {
    flash('Enter a batch name', 'error')
    return
  }
  if (validRows.value.length === 0) {
    flash('Add at least one URL', 'error')
    return
  }
  if (!validate()) {
    flash('Fix invalid URLs before submitting', 'error')
    return
  }

  isSubmitting.value = true
  submitResult.value = null
  try {
    const links = validRows.value.map(r => ({
      url: r.url.trim(),
      ...(r.slug.trim() ? { slug: r.slug.trim() } : {}),
      ...(r.comment.trim() ? { comment: r.comment.trim() } : {}),
    }))

    const data = await useAPI<{ batch: any, results: any[] }>('/api/link/bulk', {
      method: 'POST',
      body: {
        batchName: batchName.value.trim(),
        batchComment: batchComment.value.trim() || undefined,
        links,
      },
    })
    submitResult.value = data
  }
  catch (err: any) {
    flash(err?.data?.statusText || err?.statusMessage || 'Batch creation failed', 'error')
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

const successCount = computed(() => submitResult.value?.results.filter(r => r.success).length ?? 0)
const failures = computed(() => submitResult.value?.results.filter(r => !r.success) ?? [])
</script>

<template>
  <main class="space-y-6">
    <div class="flex items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold">Bulk Create Links</h1>
        <p class="text-sm text-muted-foreground mt-1">
          Upload a CSV or paste rows from a spreadsheet to create links in bulk.
        </p>
      </div>
      <NuxtLink
        to="/dashboard/batches"
        class="text-sm rounded-md border px-3 py-1.5 hover:bg-muted transition-colors"
      >
        View Batches
      </NuxtLink>
    </div>

    <!-- Inline status -->
    <div
      v-if="status"
      class="rounded-md px-4 py-2.5 text-sm"
      :class="{
        'bg-muted text-foreground': status.type === 'info',
        'bg-destructive/10 text-destructive': status.type === 'error',
        'bg-primary/10 text-primary': status.type === 'success',
      }"
    >
      {{ status.text }}
    </div>

    <!-- Result panel -->
    <div v-if="submitResult" class="rounded-lg border bg-card p-5 space-y-4">
      <div class="flex items-center justify-between gap-4">
        <h2 class="font-semibold">Batch created: {{ submitResult.batch.name }}</h2>
        <div class="flex gap-2">
          <NuxtLink
            :to="`/dashboard/batches/${submitResult.batch.id}`"
            class="text-sm rounded-md border px-3 py-1.5 hover:bg-muted transition-colors"
          >
            View Batch
          </NuxtLink>
          <button
            type="button"
            class="text-sm rounded-md bg-primary text-primary-foreground px-3 py-1.5 hover:opacity-90 transition-opacity"
            @click="reset"
          >
            Create Another
          </button>
        </div>
      </div>
      <p class="text-sm text-muted-foreground">
        {{ successCount }} created · {{ failures.length }} failed
      </p>
      <div v-if="failures.length" class="space-y-1">
        <p class="text-sm font-medium text-destructive">Failed rows:</p>
        <div
          v-for="(f, i) in failures"
          :key="i"
          class="text-xs bg-destructive/10 rounded px-3 py-1.5 font-mono"
        >
          {{ f.url }} — {{ f.error }}
        </div>
      </div>
    </div>

    <!-- Form -->
    <template v-else>
      <!-- Batch details -->
      <div class="rounded-lg border bg-card p-5 space-y-4">
        <h2 class="font-medium text-sm uppercase tracking-wide text-muted-foreground">Batch details</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="space-y-1.5">
            <label class="text-sm font-medium">Batch name <span class="text-destructive">*</span></label>
            <input
              v-model="batchName"
              type="text"
              placeholder="e.g. Campaign — June 2026"
              class="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            >
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium">Comment <span class="text-muted-foreground font-normal">(optional)</span></label>
            <input
              v-model="batchComment"
              type="text"
              placeholder="Internal notes about this batch"
              class="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            >
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex gap-4 border-b">
        <button
          type="button"
          class="pb-2 text-sm font-medium border-b-2 -mb-px transition-colors"
          :class="activeTab === 'paste' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'paste'"
        >
          Paste table
        </button>
        <button
          type="button"
          class="pb-2 text-sm font-medium border-b-2 -mb-px transition-colors"
          :class="activeTab === 'csv' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'csv'"
        >
          Upload CSV
        </button>
      </div>

      <!-- Paste tab -->
      <div v-if="activeTab === 'paste'" class="space-y-3" @paste="handlePaste">
        <p class="text-xs text-muted-foreground">
          Type, or paste directly from Excel / Google Sheets. Columns: URL, Slug (optional), Comment (optional).
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
                class="border-t"
                :class="row.error ? 'bg-destructive/5' : 'hover:bg-muted/30'"
              >
                <td class="px-3 py-1.5 text-muted-foreground text-xs">{{ index + 1 }}</td>
                <td class="px-2 py-1">
                  <input
                    v-model="row.url"
                    type="url"
                    placeholder="https://example.com/long-url"
                    class="w-full bg-transparent outline-none focus:ring-1 focus:ring-primary rounded px-1.5 py-0.5 text-sm min-w-[240px]"
                    :class="row.error ? 'ring-1 ring-destructive' : ''"
                  >
                  <p v-if="row.error" class="text-xs text-destructive px-1.5 pt-0.5">{{ row.error }}</p>
                </td>
                <td class="px-2 py-1">
                  <input
                    v-model="row.slug"
                    type="text"
                    placeholder="auto"
                    class="w-full bg-transparent outline-none focus:ring-1 focus:ring-primary rounded px-1.5 py-0.5 text-sm"
                  >
                </td>
                <td class="px-2 py-1">
                  <input
                    v-model="row.comment"
                    type="text"
                    class="w-full bg-transparent outline-none focus:ring-1 focus:ring-primary rounded px-1.5 py-0.5 text-sm"
                  >
                </td>
                <td class="px-2 py-1 text-center">
                  <button
                    type="button"
                    class="text-muted-foreground hover:text-destructive transition-colors text-lg leading-none"
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
          <button
            type="button"
            class="text-sm rounded-md border px-3 py-1.5 hover:bg-muted transition-colors"
            @click="addRow"
          >
            + Add row
          </button>
          <span class="text-xs text-muted-foreground">
            {{ validRows.length }} valid URL{{ validRows.length !== 1 ? 's' : '' }}
          </span>
        </div>
      </div>

      <!-- CSV tab -->
      <div v-if="activeTab === 'csv'" class="space-y-4">
        <p class="text-xs text-muted-foreground">
          CSV columns (header row optional): url, slug, comment.
        </p>
        <div
          class="border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors"
          :class="isDragging ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/50'"
          @dragover="onDragOver"
          @dragleave="onDragLeave"
          @drop="onDrop"
          @click="fileInput?.click()"
        >
          <input ref="fileInput" type="file" accept=".csv,text/csv" class="hidden" @change="onFileInput">
          <div v-if="csvFileName">
            <p class="text-sm font-medium">{{ csvFileName }}</p>
            <p class="text-xs text-muted-foreground mt-1">{{ rows.length }} rows loaded — click to replace</p>
          </div>
          <div v-else>
            <p class="text-sm text-muted-foreground">Drop a CSV file here, or click to browse</p>
            <p class="text-xs text-muted-foreground mt-1">.csv files only</p>
          </div>
        </div>

        <div v-if="rows.length && csvFileName" class="rounded-lg border overflow-hidden">
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
              <tr v-for="(row, i) in rows.slice(0, 10)" :key="i" class="border-t">
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

      <!-- Submit -->
      <div class="flex items-center gap-4 pt-2">
        <button
          type="button"
          class="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
          :disabled="validRows.length === 0 || !batchName.trim() || isSubmitting"
          @click="submit"
        >
          {{ isSubmitting ? 'Creating…' : `Create ${validRows.length || ''} Link${validRows.length !== 1 ? 's' : ''}` }}
        </button>
        <span class="text-xs text-muted-foreground">Requires a batch name and at least one URL.</span>
      </div>
    </template>
  </main>
</template>
