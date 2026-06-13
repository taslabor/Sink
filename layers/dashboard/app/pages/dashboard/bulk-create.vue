<script setup lang="ts">
import type { Batch } from '#shared/types/batch'

definePageMeta({
  layout: 'dashboard',
})

type LinkRow = { url: string, slug: string, comment: string, error?: string }

const activeTab = ref<'paste' | 'csv'>('paste')

// Batch target: create new, or append to an existing batch
const batchMode = ref<'new' | 'existing'>('new')
const batchName = ref('')
const batchComment = ref('')
const batchExpiry = ref('') // datetime-local string; applied to every link in this submission
const existingBatches = ref<Batch[]>([])
const selectedBatchId = ref('')

const rows = ref<LinkRow[]>(emptyRows(5))
const isSubmitting = ref(false)
const submitResult = ref<{ batch: any, added: number, results: any[] } | null>(null)
const status = ref<{ text: string, type: 'info' | 'error' | 'success' } | null>(null)

const isDragging = ref(false)
const csvFileName = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

onMounted(async () => {
  try {
    const data = await useAPI<{ batches: Batch[] }>('/api/batch')
    existingBatches.value = data.batches ?? []
  }
  catch {
    // non-fatal: the "add to existing" list just stays empty
  }
})

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

// ── Smart paste: distribute a pasted table across rows ─────────────────────
// Attached to the URL cell. If the pasted text spans multiple cells/rows
// (contains tabs or newlines), fill the grid starting at the focused row.
// A single value pastes normally into the one cell.
function handleCellPaste(event: ClipboardEvent, startRow: number) {
  const text = event.clipboardData?.getData('text') ?? ''
  if (!text.includes('\t') && !text.includes('\n'))
    return // single cell — let the browser paste it normally

  event.preventDefault()
  const parsed = parseTabSeparated(text)
  if (!parsed.length)
    return

  for (let i = 0; i < parsed.length; i++) {
    const target = startRow + i
    if (target >= rows.value.length)
      rows.value.push({ url: '', slug: '', comment: '' })
    rows.value[target] = { ...parsed[i] }
  }
  flash(`Pasted ${parsed.length} row${parsed.length !== 1 ? 's' : ''}`, 'success')
}

// Fallback for pasting when focus isn't in a cell
function handleContainerPaste(event: ClipboardEvent) {
  const target = event.target as HTMLElement
  if (target.tagName === 'INPUT')
    return
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
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n').map((line) => {
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
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n')
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

// ── Expiry ─────────────────────────────────────────────────────────────────
function expiryUnix(): number | undefined {
  if (!batchExpiry.value)
    return undefined
  const ms = new Date(batchExpiry.value).getTime()
  if (Number.isNaN(ms))
    return undefined
  return Math.floor(ms / 1000)
}
// min for the datetime-local input: ~2 minutes from now (KV needs a future TTL)
const minExpiry = computed(() => {
  const d = new Date(Date.now() + 2 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
})

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
  // Target validation
  if (batchMode.value === 'existing' && !selectedBatchId.value) {
    flash('Choose a batch to add to', 'error')
    return
  }
  if (batchMode.value === 'new' && !batchName.value.trim()) {
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

  const expiration = expiryUnix()
  if (batchExpiry.value && expiration && expiration * 1000 <= Date.now()) {
    flash('Expiry must be in the future', 'error')
    return
  }

  isSubmitting.value = true
  submitResult.value = null
  try {
    const links = validRows.value.map(r => ({
      url: r.url.trim(),
      ...(r.slug.trim() ? { slug: r.slug.trim() } : {}),
      ...(r.comment.trim() ? { comment: r.comment.trim() } : {}),
      ...(expiration ? { expiration } : {}),
    }))

    const body: Record<string, any> = { links }
    if (batchMode.value === 'existing') {
      body.batchId = selectedBatchId.value
    }
    else {
      body.batchName = batchName.value.trim()
      body.batchComment = batchComment.value.trim() || undefined
    }

    const data = await useAPI<{ batch: any, added: number, results: any[] }>('/api/link/bulk', {
      method: 'POST',
      body,
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
  batchExpiry.value = ''
  selectedBatchId.value = ''
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
        <h2 class="font-semibold">
          {{ submitResult.added }} link{{ submitResult.added !== 1 ? 's' : '' }} added to “{{ submitResult.batch.name }}”
        </h2>
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
            Add More
          </button>
        </div>
      </div>
      <p class="text-sm text-muted-foreground">
        {{ successCount }} created · {{ failures.length }} failed · batch now holds {{ submitResult.batch.count.toLocaleString() }}
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
      <!-- Batch target -->
      <div class="rounded-lg border bg-card p-5 space-y-4">
        <h2 class="font-medium text-sm uppercase tracking-wide text-muted-foreground">Batch</h2>

        <!-- Mode switch -->
        <div class="flex gap-2">
          <button
            type="button"
            class="text-sm rounded-md border px-3 py-1.5 transition-colors"
            :class="batchMode === 'new' ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'"
            @click="batchMode = 'new'"
          >
            New batch
          </button>
          <button
            type="button"
            class="text-sm rounded-md border px-3 py-1.5 transition-colors"
            :class="batchMode === 'existing' ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'"
            @click="batchMode = 'existing'"
          >
            Add to existing
          </button>
        </div>

        <!-- New batch fields -->
        <div v-if="batchMode === 'new'" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

        <!-- Existing batch select -->
        <div v-else class="space-y-1.5">
          <label class="text-sm font-medium">Choose batch <span class="text-destructive">*</span></label>
          <select
            v-model="selectedBatchId"
            class="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="" disabled>Select a batch…</option>
            <option v-for="b in existingBatches" :key="b.id" :value="b.id">
              {{ b.name }} ({{ b.count.toLocaleString() }} links)
            </option>
          </select>
          <p v-if="existingBatches.length === 0" class="text-xs text-muted-foreground">
            No batches yet — create one with “New batch”.
          </p>
        </div>

        <!-- Expiry (applies to all links in this submission) -->
        <div class="space-y-1.5 max-w-xs">
          <label class="text-sm font-medium">Link expiry <span class="text-muted-foreground font-normal">(optional)</span></label>
          <input
            v-model="batchExpiry"
            type="datetime-local"
            :min="minExpiry"
            class="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          >
          <p class="text-xs text-muted-foreground">
            Applied to every link in this submission. Leave blank for no expiry.
          </p>
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
      <div v-if="activeTab === 'paste'" class="space-y-3" @paste="handleContainerPaste">
        <p class="text-xs text-muted-foreground">
          Paste a whole table from Excel / Google Sheets into the first URL cell — it fills the grid automatically.
          Columns: URL, Slug (optional), Comment (optional).
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
                    @paste="(e) => handleCellPaste(e as ClipboardEvent, index)"
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
          :disabled="validRows.length === 0 || isSubmitting"
          @click="submit"
        >
          {{ isSubmitting ? 'Creating…' : `${batchMode === 'existing' ? 'Add' : 'Create'} ${validRows.length || ''} Link${validRows.length !== 1 ? 's' : ''}` }}
        </button>
        <span class="text-xs text-muted-foreground">
          {{ batchMode === 'existing' ? 'Adds to the selected batch.' : 'Requires a batch name and at least one URL.' }}
        </span>
      </div>
    </template>
  </main>
</template>
