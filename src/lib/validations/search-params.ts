import { z } from 'zod'
import { sortOrders } from '@/lib/nuqs'

export const sortOrderSchema = z.enum(sortOrders)

export const spaceSearchParamsSchema = z.object({
  q: z.string(),
  page: z.number().int().positive(),
  perPage: z.number().int().positive(),
  sort: sortOrderSchema,
})

export const spaceSearchParamsDefaults = {
  q: '',
  page: 1,
  perPage: 10,
  sort: 'desc',
} satisfies z.output<typeof spaceSearchParamsSchema>

export const blogSearchParamsSchema = z.object({
  q: z.string(),
  page: z.number().int().positive(),
  perPage: z.number().int().positive(),
  category: z.string(),
  tags: z.array(z.string()),
  sort: sortOrderSchema,
})

export const blogSearchParamsDefaults = {
  q: '',
  page: 1,
  perPage: 10,
  category: '',
  tags: [],
  sort: 'desc',
} satisfies z.output<typeof blogSearchParamsSchema>
