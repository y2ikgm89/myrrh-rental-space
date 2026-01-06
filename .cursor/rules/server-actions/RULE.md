---
description: "Standards for Server Actions in Next.js 16 App Router"
globs:
  - "src/actions/**"
alwaysApply: false
---

# Server Actions Standards

This rule provides guidance for implementing Server Actions in Next.js 16 App Router.

## Server Actions Location

- **Directory**: `src/actions/` for public actions, `src/actions/admin/` for admin actions
- **File naming**: Use kebab-case (`reservation.ts`, `space-management.ts`)
- **One file per domain**: Group related actions in the same file

## Server Actions Structure

### Basic Pattern

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { reservationSchema } from '@/lib/validations/reservation'

export async function createReservation(
  data: z.infer<typeof reservationSchema>
): Promise<{ success: boolean; error?: string }> {
  // 1. Authentication check
  const session = await auth()
  if (!session) {
    return { success: false, error: 'Unauthorized' }
  }

  // 2. Input validation
  const validatedData = reservationSchema.parse(data)

  // 3. Business logic
  try {
    const reservation = await prisma.reservation.create({
      data: validatedData,
    })

    // 4. Cache invalidation
    revalidatePath('/reservations')
    revalidatePath(`/spaces/${validatedData.spaceId}`)

    return { success: true }
  } catch (error) {
    return { success: false, error: 'Failed to create reservation' }
  }
}
```

## Authentication & Authorization

- **Always check authentication**: Verify user session before processing
- **Role-based access**: Check user roles for admin actions
- **Error handling**: Return appropriate error messages for unauthorized access

```typescript
const session = await auth()
if (!session) {
  return { success: false, error: 'Unauthorized' }
}

// For admin actions
if (session.user.role !== 'admin') {
  return { success: false, error: 'Forbidden' }
}
```

## Input Validation

- **Use Zod schemas**: Always validate inputs with Zod schemas
- **Schema location**: Define schemas in `src/lib/validations/`
- **Type inference**: Use `z.infer<typeof schema>` for type safety

```typescript
import { reservationSchema } from '@/lib/validations/reservation'

const validatedData = reservationSchema.parse(data)
```

## Error Handling

- **Return objects**: Return `{ success: boolean; error?: string; data?: T }` pattern
- **Try-catch blocks**: Wrap database operations in try-catch
- **User-friendly errors**: Provide clear error messages

## Cache Invalidation

- **Use `revalidatePath()`**: Invalidate specific paths after mutations
- **Use `revalidateTag()`**: Invalidate cache tags when using tagged caching
- **Use `updateTag()`**: Update tag timestamps without full invalidation (Next.js 16, more granular control)
- **Use `refresh()`**: Refresh the current page cache (Next.js 16)
- **Invalidate related paths**: Update all affected pages

```typescript
import { revalidatePath, revalidateTag, updateTag, refresh } from 'next/cache'

// After creating a reservation
revalidatePath('/reservations')
revalidatePath(`/spaces/${spaceId}`)
revalidatePath('/admin/reservations')

// When using cache tags
revalidateTag('reservations')

// Advanced cache invalidation (Next.js 16)
export async function updateSpace(id: string, data: UpdateSpaceData) {
  await prisma.space.update({
    where: { id },
    data,
  })

  // Option 1: Revalidate specific paths
  revalidatePath('/spaces')
  revalidatePath(`/spaces/${id}`)

  // Option 2: Revalidate by tag
  revalidateTag('spaces-list')

  // Option 3: Update tag timestamp (more granular, Next.js 16)
  updateTag('spaces-list')

  // Option 4: Refresh current page cache (Next.js 16)
  refresh()
}
```

## Database Operations

- **Use Prisma**: All database operations should use Prisma Client
- **Transactions**: Use transactions for multiple related operations
- **Select fields**: Use `select` to fetch only necessary fields
- **Avoid N+1**: Use `include` to avoid N+1 query problems

```typescript
// Good: Select only needed fields
const reservation = await prisma.reservation.findUnique({
  where: { id },
  select: {
    id: true,
    date: true,
    space: { select: { name: true } },
  },
})

// Good: Use include to avoid N+1
const reservations = await prisma.reservation.findMany({
  include: {
    space: true,
    customer: true,
  },
})
```

## Type Safety

- **Explicit return types**: Always specify return types
- **Use inferred types**: Leverage Zod schema inference
- **Type exports**: Export types for use in components

```typescript
export async function getReservation(
  id: string
): Promise<{ success: boolean; data?: Reservation; error?: string }> {
  // Implementation
}
```

## Performance

- **Parallel operations**: Use `Promise.all` for independent operations
- **Pagination**: Implement pagination for large datasets
- **Database indexes**: Ensure proper indexes for query performance

For detailed best practices, see [`docs/BEST_PRACTICES.md`](../../docs/BEST_PRACTICES.md).
