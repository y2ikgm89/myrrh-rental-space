---
name: nextjs-app-router
description: Provides guidance for implementing Next.js 16 App Router patterns, Server Components, Server Actions, and caching strategies following the latest official best practices. Use when creating or modifying Next.js pages and routes, implementing Server Components or Client Components, working with Server Actions, implementing caching strategies, handling data fetching in Server Components, or working with dynamic routes and static generation.
compatibility: Designed for Cursor (or similar AI coding assistants). Requires Next.js 16 or later.
metadata:
  author: myrrh-rental-space
  version: "1.0.0"
  framework: "Next.js 16"
---

# Next.js 16 App Router

This skill provides guidance for implementing Next.js 16 App Router patterns, Server Components, Server Actions, and caching strategies following the latest official best practices.

## When to use this skill

Use this skill when:
- Creating or modifying Next.js pages and routes
- Implementing Server Components or Client Components
- Working with Server Actions
- Implementing caching strategies
- Handling data fetching in Server Components
- Working with dynamic routes and static generation

## Examples

**Example 1**: "Create a new page that displays a list of spaces"
- This skill will guide you to use Server Components by default, fetch data with `await` directly, and use `select` to optimize queries.

**Example 2**: "Add a form to create a new reservation"
- This skill will guide you to create a Client Component for interactivity, use Server Actions for mutations, and implement proper validation and cache invalidation.

**Example 3**: "Implement caching for the spaces list page"
- This skill will guide you to use `unstable_cache` for function result caching, set appropriate tags, and use `revalidateTag()` after mutations.

## Instructions

### Server Components (Default)

- **Default to Server Components**: All components are Server Components by default
- **Use `await` directly**: In Server Components, use `await` directly for data fetching
- **No `'use client'` directive**: Only add `'use client'` when absolutely necessary (interactivity, browser APIs, hooks)

```typescript
// ✅ Good: Server Component (default)
import { prisma } from '@/lib/prisma'

export default async function SpacesPage() {
  const spaces = await prisma.space.findMany({
    where: { isPublished: true },
    select: {
      id: true,
      name: true,
      mainImageUrl: true,
      hourlyPrice: true,
    },
  })

  return (
    <div>
      {spaces.map(space => (
        <SpaceCard key={space.id} space={space} />
      ))}
    </div>
  )
}
```

### Client Components

- **Minimize Client Components**: Only use for interactive elements (forms, animations, browser APIs)
- **Explicit `'use client'` directive**: Always add `'use client'` at the top of the file
- **Keep Client Components small**: Extract Server Component logic when possible

```typescript
// ✅ Good: Client Component (interactive form)
'use client'

import { useState, useTransition } from 'react'
import { createReservation } from '@/actions/reservation'

export function ReservationForm({ spaceId }: { spaceId: string }) {
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await createReservation(formData)
    })
  }

  return (
    <form action={handleSubmit}>
      {/* form content */}
      <button type="submit" disabled={isPending}>
        {isPending ? 'Submitting...' : 'Submit'}
      </button>
    </form>
  )
}
```

### Server Actions

- **Use `'use server'` directive**: Always add `'use server'` at the top of Server Action files
- **Authentication check**: Always verify authentication and authorization in Server Actions
- **Input validation**: Use Zod schemas for validation (both client and server)
- **Cache invalidation**: Use `revalidatePath()` and `revalidateTag()` after mutations

```typescript
// ✅ Good: Server Action with validation and cache invalidation
'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createSpaceSchema } from '@/lib/validations/space'

export async function createSpace(formData: FormData) {
  // 1. Authentication check
  const session = await auth()
  if (!session || session.user.role !== 'admin') {
    throw new Error('Unauthorized')
  }

  // 2. Validation
  const data = createSpaceSchema.parse({
    name: formData.get('name'),
    description: formData.get('description'),
    // ...
  })

  // 3. Database operation
  const space = await prisma.space.create({
    data,
  })

  // 4. Cache invalidation
  revalidatePath('/spaces')
  revalidatePath(`/spaces/${space.id}`)
  revalidateTag('spaces-list')

  return { success: true, spaceId: space.id }
}
```

### Caching Strategy

- **Use `unstable_cache`**: For function result caching with tags
- **Use `unstable_noStore()`**: For dynamic data that should not be cached (user-specific data, authenticated data)
- **Use `revalidatePath()`**: For path-based cache invalidation
- **Use `revalidateTag()`**: For tag-based cache invalidation
- **Use `updateTag()`**: For updating tag timestamps without full invalidation (Next.js 16)
- **Use `refresh()`**: For refreshing the current page cache (Next.js 16)
- **Never cache sensitive data**: User-specific data, session information, authentication tokens must not be cached

```typescript
// ✅ Good: Function result caching
import { unstable_cache } from 'next/cache'

export const getSpaces = unstable_cache(
  async () => {
    return await prisma.space.findMany({
      where: { isPublished: true },
    })
  },
  ['spaces'], // cache key
  {
    tags: ['spaces-list'],
    revalidate: 3600, // 1 hour
  }
)

// ✅ Good: Dynamic data (no cache)
import { unstable_noStore } from 'next/cache'

export async function getUserReservations(userId: string) {
  unstable_noStore() // Do not cache user-specific data
  return await prisma.reservation.findMany({
    where: { userId },
  })
}
```

### Advanced Cache Invalidation (Next.js 16)

- **Use `updateTag()`**: For updating tag timestamps without full invalidation (more granular control)
- **Use `refresh()`**: For refreshing the current page cache

```typescript
// ✅ Good: updateTag for granular cache control
'use server'

import { updateTag } from 'next/cache'

export async function updateSpace(id: string, data: UpdateSpaceData) {
  await prisma.space.update({
    where: { id },
    data,
  })

  // Update tag timestamp (more granular than revalidateTag)
  updateTag('spaces-list')
}

// ✅ Good: refresh for current page cache
'use server'

import { refresh } from 'next/cache'

export async function updateSpace(id: string, data: UpdateSpaceData) {
  await prisma.space.update({
    where: { id },
    data,
  })

  // Refresh current page cache
  refresh()
}

// ✅ Good: Combining cache invalidation methods
'use server'

import { revalidatePath, revalidateTag, updateTag, refresh } from 'next/cache'

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

  // Option 3: Update tag timestamp (more granular)
  updateTag('spaces-list')

  // Option 4: Refresh current page cache
  refresh()
}
```

### Dynamic Routes and Static Generation

- **Use `generateStaticParams`**: For dynamic routes that can be pre-rendered
- **Use ISR**: For semi-static content with `revalidate` option
- **Use SSG**: For fully static content

```typescript
// ✅ Good: generateStaticParams for dynamic routes
export async function generateStaticParams() {
  const spaces = await prisma.space.findMany({
    where: { isPublished: true },
    select: { id: true },
  })

  return spaces.map(space => ({
    id: space.id,
  }))
}

export default async function SpacePage({ params }: { params: { id: string } }) {
  const space = await prisma.space.findUnique({
    where: { id: params.id },
  })

  if (!space) {
    notFound()
  }

  return <SpaceDetails space={space} />
}
```

### Error Handling

- **Use `notFound()`**: For 404 errors
- **Use try-catch**: For error handling in Server Actions
- **Return error objects**: Instead of throwing errors when possible

```typescript
// ✅ Good: Error handling in Server Actions
'use server'

import { z } from 'zod'

export async function createSpace(formData: FormData) {
  try {
    const data = createSpaceSchema.parse({
      name: formData.get('name'),
      // ...
    })

    const space = await prisma.space.create({ data })
    revalidatePath('/spaces')

    return { success: true, spaceId: space.id }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Validation error',
        details: error.errors,
      }
    }

    console.error('Unexpected error:', error)
    return {
      success: false,
      error: 'An unexpected error occurred',
    }
  }
}
```

## Best Practices

1. **Server Components by default**: Only use Client Components when necessary
2. **Direct data fetching**: Use `await` directly in Server Components
3. **Cache invalidation**: Always invalidate cache after mutations using `revalidatePath()`, `revalidateTag()`, `updateTag()`, or `refresh()`
4. **Input validation**: Always validate inputs with Zod schemas
5. **Authentication**: Always check authentication in Server Actions
6. **Error handling**: Use proper error handling patterns
7. **Type safety**: Use explicit TypeScript types for all function parameters and return values
8. **Advanced cache control**: Use `updateTag()` for granular cache updates and `refresh()` for page-level cache refresh

## References

- [Next.js 16 Documentation](https://nextjs.org/docs)
- [Next.js App Router Best Practices](https://nextjs.org/docs/app/building-your-application/routing)
- [React Server Components](https://react.dev/reference/rsc/server-components)
- [Next.js Caching](https://nextjs.org/docs/app/building-your-application/caching)
- Project documentation: `docs/BEST_PRACTICES.md`, `docs/CACHING_STRATEGY.md`, `docs/PROJECT_STRUCTURE.md`
