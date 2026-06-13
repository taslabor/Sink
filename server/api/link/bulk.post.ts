import { z } from 'zod'
import type { Batch } from '~/shared/types/batch'

// POST /api/link/bulk
// Body: { batchName: string, batchComment?: string, links: Array<{ url, slug?, comment?, expiration? }> }
// Returns: { batch: Batch, results: Array<{ slug, url, success, error? }> }

const LinkSchema = z.object({
  url: z.string().url(),
  slug: z.string().optional(),
  comment: z.string().optional(),
  expiration: z.number().int().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
})

const BulkSchema = z.object({
  batchName: z.string().min(1).max(200),
  batchComment: z.string().max(500).optional(),
  links: z.array(LinkSchema).min(1).max(10000),
})

export default defineEventHandler(async (event) => {
  const { KV } = event.context.cloudflare.env

  const body = await readBody(event)
  const parsed = BulkSchema.safeParse(body)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      message: parsed.error.errors.map(e => e.message).join(', '),
    })
  }

  const { batchName, batchComment, links } = parsed.data

  // Create the batch record first
  const batchId = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)

  const batch: Batch = {
    id: batchId,
    name: batchName,
    comment: batchComment,
    createdAt: now,
    count: links.length,
  }

  await KV.put(`batch:${batchId}`, JSON.stringify(batch))

  // Process each link by calling the create logic directly
  // We stamp each link with the batchId in the comment field metadata
  // using a structured comment: "__batch:{batchId}__ {original comment}"
  const results: Array<{ slug: string, url: string, success: boolean, error?: string }> = []

  for (const link of links) {
    try {
      // Generate slug if not provided
      let slug = link.slug?.trim()
      if (!slug) {
        const slugLength = parseInt(process.env.NUXT_PUBLIC_SLUG_DEFAULT_LENGTH || '5')
        slug = generateRandomSlug(slugLength)
        // Ensure uniqueness — retry up to 5 times
        let attempts = 0
        while (attempts < 5) {
          const existing = await KV.get(`link:${slug}`)
          if (!existing) break
          slug = generateRandomSlug(slugLength)
          attempts++
        }
      }

      // Check slug doesn't already exist
      const existing = await KV.get(`link:${slug}`)
      if (existing) {
        results.push({ slug, url: link.url, success: false, error: `Slug "${slug}" already exists` })
        continue
      }

      const linkData = {
        id: crypto.randomUUID(),
        url: link.url,
        slug,
        comment: link.comment || '',
        expiration: link.expiration,
        title: link.title,
        description: link.description,
        createdAt: now,
        updatedAt: now,
        batchId, // stored directly on the link object
      }

      await KV.put(`link:${slug}`, JSON.stringify(linkData))
      results.push({ slug, url: link.url, success: true })
    }
    catch (err: any) {
      results.push({ slug: link.slug || '', url: link.url, success: false, error: err?.message || 'Unknown error' })
    }
  }

  // Update batch count to reflect actual successes (in case some failed)
  const successCount = results.filter(r => r.success).length
  if (successCount !== batch.count) {
    batch.count = successCount
    await KV.put(`batch:${batchId}`, JSON.stringify(batch))
  }

  return { batch, results }
})

function generateRandomSlug(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}
