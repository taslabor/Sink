export interface Batch {
  id: string
  name: string
  comment?: string
  createdAt: number // unix seconds
  count: number // total links in this batch
}
