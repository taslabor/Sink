# Required one-line edit: add `batchId` to the link schema

For batch grouping to persist, the link schema needs to allow a `batchId` field.
Without this, validation may strip it before the link is saved.

## What to do

1. Open `shared/schemas/link.ts` in your repo
2. Find the main link schema object — it's a `z.object({ ... })` containing fields
   like `url`, `slug`, `comment`, `expiration`, etc.
3. Add this line alongside the other optional fields:

   ```ts
   batchId: z.string().optional(),
   ```

   For example, if you see:

   ```ts
   export const LinkSchema = z.object({
     url: z.string().url(),
     slug: z.string(),
     comment: z.string().optional(),
     // ...
   })
   ```

   make it:

   ```ts
   export const LinkSchema = z.object({
     url: z.string().url(),
     slug: z.string(),
     comment: z.string().optional(),
     batchId: z.string().optional(),   // ← add this
     // ...
   })
   ```

4. Commit the change.

## Why this is needed

The bulk endpoint stamps `link.batchId = batchId` before saving each link, using the
same `putLink` helper as the single-create endpoint. If your schema validates and
strips unknown keys, `batchId` would be discarded unless it's declared. Adding it as an
optional string lets it flow through validation and into KV storage, where the batch
detail view reads it back.

## One thing to verify

This assumes `putLink` persists the full validated link object (the normal pattern). If
your `putLink` helper instead writes only a hand-picked list of fields, `batchId` won't
be saved even with the schema change — in that case, tell me and I'll adjust the approach
(e.g. a separate batch-membership index).
