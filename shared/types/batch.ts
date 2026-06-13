export interface Batch {
  id: string
  name: string
  comment?: string
  createdAt: number // unix seconds
  count: number // number of links successfully created in this batch
}
