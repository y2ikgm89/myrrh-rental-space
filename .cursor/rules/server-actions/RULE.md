---
description: "Standards for Server Actions in Next.js 16 App Router"
globs:
  - "src/actions/**"
alwaysApply: false
---

# Server Actions Standards

This rule provides guidance for implementing Server Actions in Next.js 16 App Router.

**Related Rules**: See `@security` for authentication, authorization, rate limiting, and bot protection patterns, `@code-style` for TypeScript and code style standards, `@api-routes` for comparison with Route Handlers.

**Example Files**:
- `@src/actions/reservation.ts` (if exists)
- `@src/actions/admin/space-management.ts` (if exists)
- `@src/lib/validations/reservation.ts` (validation schemas)

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

type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string; details?: unknown }

export async function createReservation(
  data: z.infer<typeof reservationSchema>
): Promise<Result<Reservation>> {
  // 1. Authentication check
  const session = await auth()
  if (!session) {
    return { success: false, error: 'Unauthorized', code: 'AUTHENTICATION_ERROR' }
  }

  // 2. Input validation
  let validatedData: z.infer<typeof reservationSchema>
  try {
    validatedData = reservationSchema.parse(data)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: error.errors,
      }
    }
    throw error
  }

  // 3. Business logic
  try {
    const reservation = await prisma.reservation.create({
      data: validatedData,
    })

    // 4. Cache invalidation
    revalidatePath('/reservations')
    revalidatePath(`/spaces/${validatedData.spaceId}`)

    return { success: true, data: reservation }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return {
          success: false,
          error: 'Duplicate entry',
          code: 'CONFLICT',
        }
      }
    }
    console.error('Failed to create reservation:', error)
    return {
      success: false,
      error: 'Failed to create reservation',
      code: 'INTERNAL_ERROR',
    }
  }
}
```

## Authentication & Authorization

- **Always check authentication**: Verify user session before processing (see `@security` for patterns)
- **Role-based access**: Check user roles for admin actions
- **Error handling**: Return appropriate error messages for unauthorized access

```typescript
const session = await auth()
if (!session) {
  return { success: false, error: 'Unauthorized', code: 'AUTHENTICATION_ERROR' }
}

if (session.user.role !== 'admin') {
  return { success: false, error: 'Forbidden', code: 'AUTHORIZATION_ERROR' }
}
```

## Rate Limiting

- **Implement rate limiting**: Apply rate limiting to prevent abuse (see `@security` for patterns)
- **Use `@upstash/ratelimit`**: Use `@upstash/ratelimit` with Redis for distributed rate limiting

```typescript
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { headers } from 'next/headers'

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '15 m'),
})

export async function createReservation(data: ReservationData) {
  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown'
  
  const { success } = await ratelimit.limit(`reservation:${ip}`)
  if (!success) {
    return {
      success: false,
      error: 'Too many requests. Please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
    }
  }
  
  // Continue with reservation creation
}
```

## Bot Protection (Turnstile)

- **Verify Turnstile tokens**: For form submission actions, verify Cloudflare Turnstile tokens (see `@security` for patterns)

```typescript
import { verifyTurnstileToken } from '@/lib/turnstile'

export async function createReservation(data: ReservationData & { turnstileToken?: string }) {
  if (!data.turnstileToken) {
    return {
      success: false,
      error: 'Turnstile token is required',
      code: 'VALIDATION_ERROR',
    }
  }
  
  const isValid = await verifyTurnstileToken(data.turnstileToken)
  if (!isValid) {
    return {
      success: false,
      error: 'Turnstile verification failed',
      code: 'VALIDATION_ERROR',
    }
  }
  
  // Continue with reservation creation
}
```

## Input Validation

- **Use Zod schemas**: Always validate inputs with Zod schemas (see `@security` for validation patterns)
- **Use `safeParse` for `unknown` inputs**: Treat action inputs as untrusted and validate before use
- **Avoid `as` casts**: Do not cast inputs to satisfy types
- **Schema location**: Define schemas in `src/lib/validations/`
- **Type inference**: Use `z.infer<typeof schema>` for type safety

```typescript
import { reservationSchema } from '@/lib/validations/reservation'

const validatedData = reservationSchema.parse(data)
```

## Error Handling

- **Discriminated union types**: Use `Result<T>` pattern with `success` flag for type safety
- **Error codes**: Include `code` field for programmatic error handling
- **Error details**: Include `details` field for additional error information (validation errors, etc.)
- **Try-catch blocks**: Wrap database operations in try-catch
- **User-friendly errors**: Provide clear error messages

```typescript
type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string; details?: unknown }

export async function createSpace(
  data: CreateSpaceInput
): Promise<Result<Space>> {
  try {
    const validatedData = createSpaceSchema.parse(data)
    const space = await prisma.space.create({ data: validatedData })
    return { success: true, data: space }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: error.errors,
      }
    }
    
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return {
          success: false,
          error: 'Duplicate entry',
          code: 'CONFLICT',
        }
      }
      if (error.code === 'P2025') {
        return {
          success: false,
          error: 'Record not found',
          code: 'NOT_FOUND',
        }
      }
    }
    
    console.error('Unexpected error:', error)
    return {
      success: false,
      error: 'An unexpected error occurred',
      code: 'INTERNAL_ERROR',
    }
  }
}
```

**Standard error codes**:
- `VALIDATION_ERROR`: Validation errors (Zod errors, etc.)
- `AUTHENTICATION_ERROR`: Authentication errors (not logged in, etc.)
- `AUTHORIZATION_ERROR`: Authorization errors (insufficient permissions, etc.)
- `NOT_FOUND`: Resource not found
- `CONFLICT`: Resource conflicts (duplicate entries, overlapping time slots, etc.)
- `RATE_LIMIT_EXCEEDED`: Rate limit exceeded
- `INTERNAL_ERROR`: Internal server errors (unexpected errors)

## Cache Invalidation

- **Use `revalidatePath()`**: Invalidate specific paths after mutations
- **Use `revalidateTag()`**: Invalidate cache tags when using tagged caching
- **Use `updateTag()`**: Update tag timestamps without full invalidation (Next.js 16, more granular control)
  - Immediately expires cache for the specified tag
  - Server Actions exclusive (cannot be used in Route Handlers)
- **Use `refresh()`**: Refresh the current page cache (Next.js 16)
  - Useful for "read-your-writes" scenarios where users should see their changes immediately
- **Invalidate related paths**: Update all affected pages

```typescript
import { revalidatePath, revalidateTag, updateTag, refresh } from 'next/cache'

// After creating a reservation
revalidatePath('/reservations')
revalidatePath(`/spaces/${spaceId}`)
revalidatePath('/admin/reservations')

// When using cache tags (stale-while-revalidate semantics)
revalidateTag('reservations', 'max')

// Advanced cache invalidation (Next.js 16)
export async function updateSpace(id: string, data: UpdateSpaceData) {
  await prisma.space.update({
    where: { id },
    data,
  })

  // Option 1: Revalidate specific paths
  revalidatePath('/spaces')
  revalidatePath(`/spaces/${id}`)

  // Option 2: Revalidate by tag (stale-while-revalidate semantics)
  revalidateTag('spaces-list', 'max')

  // Option 3: Update tag timestamp (more granular, Next.js 16)
  // Immediately expires cache for this tag, ensuring fresh data on next request
  updateTag('spaces-list')

  // Option 4: Refresh current page cache (Next.js 16)
  // Refreshes the current page's cache (useful for "read-your-writes" scenarios)
  refresh()
}
```

## Database Operations

- **Use Prisma**: All database operations should use Prisma Client
- **Transactions**: Use transactions for multiple related operations
- **Select fields**: Use `select` to fetch only necessary fields
- **Avoid N+1**: Use `include` to avoid N+1 query problems

```typescript
// Select only needed fields
const reservation = await prisma.reservation.findUnique({
  where: { id },
  select: { id: true, date: true, space: { select: { name: true } } },
})

// Use include to avoid N+1
const reservations = await prisma.reservation.findMany({
  include: { space: true, customer: true },
})
```

## Type Safety

- **Explicit return types**: Always specify return types (see `@code-style` for type definitions)
- **Use inferred types**: Leverage Zod schema inference with `z.infer<typeof schema>`
- **Type exports**: Export types for use in components

```typescript
type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string; details?: unknown }

export async function getReservation(
  id: string
): Promise<Result<Reservation>> {
  // Implementation
}
```

## Performance

- **Parallel operations**: Use `Promise.all` for independent operations
- **Pagination**: Implement pagination for large datasets
- **Database indexes**: Ensure proper indexes for query performance

**Related Documentation**:
- [`docs/BEST_PRACTICES.md`](../../docs/BEST_PRACTICES.md) - Best practices and patterns
- [`docs/API.md`](../../docs/API.md) - API specifications
- [`docs/SECURITY.md`](../../docs/SECURITY.md) - Security requirements
- [`docs/CACHING_STRATEGY.md`](../../docs/CACHING_STRATEGY.md) - Cache invalidation strategies
