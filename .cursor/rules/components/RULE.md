---
description: "Standards for React components (Server Components and Client Components)"
globs:
  - "src/components/**"
alwaysApply: false
---

# Component Standards

This rule provides guidance for implementing React components in Next.js 16 App Router.

**Related Rules**: See `@code-style` for TypeScript and naming conventions, `@server-actions` for Server Actions integration patterns, `@security` for security best practices.

**Example Files**:
- `@src/components/public/reservation-form.tsx` (if exists)
- `@src/components/ui/button.tsx` (if exists)
- `@src/app/spaces/[id]/page.tsx` (Server Component example)

## Component Types

### Server Components (Default)

- **Default**: All components are Server Components unless explicitly marked as Client Components
- **Benefits**: SEO, performance (reduced client-side JavaScript), security, direct database access
- **Use when**: Displaying data, static content, layout components

```typescript
// Server Component (default)
import { prisma } from '@/lib/prisma'

export async function SpaceList() {
  const spaces = await prisma.space.findMany({
    where: { published: true },
  })

  return (
    <div>
      {spaces.map((space) => (
        <SpaceCard key={space.id} space={space} />
      ))}
    </div>
  )
}
```

### Client Components

- **Directive**: Use `'use client'` directive explicitly
- **Use when**: 
  - User interactions (forms, buttons, modals)
  - Browser APIs (localStorage, window)
  - State management (useState, useEffect)
  - Animations (GSAP, Framer Motion)
  - Third-party libraries requiring client-side execution

```typescript
'use client'

import { useState } from 'react'

interface ReservationFormProps {
  spaceId: string
  onSubmit: (data: ReservationData) => Promise<void>
}

export function ReservationForm({ spaceId, onSubmit }: ReservationFormProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (data: ReservationData) => {
    setIsLoading(true)
    try {
      await onSubmit(data)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
    </form>
  )
}
```

## Component Structure

- **Props interface**: Define props interface at the top of the file (see `@code-style` for file organization and naming conventions)

### Component Directory Structure

```
src/components/
├── ui/              # Basic UI components (buttons, inputs, etc.)
├── public/          # Public-facing components
├── admin/           # Admin components
└── layout/          # Layout components (Header, Footer, etc.)
```

## Component Patterns

### Server Component Fetching Data

```typescript
import { prisma } from '@/lib/prisma'
import { unstable_cache } from 'next/cache'

export async function SpaceList() {
  const getSpaces = unstable_cache(
    async () => {
      return await prisma.space.findMany({
        where: { published: true },
      })
    },
    ['spaces-list'],
    {
      tags: ['spaces'],
      revalidate: 3600, // 1 hour
    }
  )

  const spaces = await getSpaces()

  return (
    <div>
      {spaces.map((space) => (
        <SpaceCard key={space.id} space={space} />
      ))}
    </div>
  )
}
```

### React 19 Promise Passing Pattern

- **Pass Promises directly**: Server Components can pass Promises to Client Components
- **Use `use()` hook**: Client Components use React 19's `use()` hook to resolve Promises
- **Wrap with Suspense**: Always wrap Promise-consuming Client Components with `<Suspense>`

```typescript
// ✅ Good: Promise passing from Server to Client Component
// Server Component
import { Suspense } from 'react'
import { prisma } from '@/lib/prisma'
import { Comments } from '@/components/blog/comments'

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  // Critical data: await in Server Component
  const post = await prisma.blogPost.findUnique({
    where: { slug: params.slug, isPublished: true },
  })

  if (!post) {
    notFound()
  }

  // Promise passed directly to Client Component
  const commentsPromise = prisma.comment.findMany({
    where: { postId: post.id },
  })

  return (
    <article>
      <h1>{post.title}</h1>
      <BlogContent content={post.content} />
      <Suspense fallback={<CommentsLoading />}>
        <Comments commentsPromise={commentsPromise} />
      </Suspense>
    </article>
  )
}

// Client Component
'use client'

import { use } from 'react'

interface CommentsProps {
  commentsPromise: Promise<Comment[]>
}

export function Comments({ commentsPromise }: CommentsProps) {
  const comments = use(commentsPromise)

  return (
    <div>
      {comments.map(comment => (
        <Comment key={comment.id} comment={comment} />
      ))}
    </div>
  )
}
```

### Client Component with Server Action

**Recommended**: Use `useTransition` for better UX with Server Actions (React 19 + Next.js 16).

```typescript
'use client'

import { useTransition } from 'react'
import { createReservation } from '@/actions/reservation'

export function ReservationForm({ spaceId }: { spaceId: string }) {
  const [isPending, startTransition] = useTransition()

  const handleSubmit = async (formData: FormData) => {
    startTransition(async () => {
      const result = await createReservation({
        spaceId,
        date: formData.get('date') as string,
        // ... other fields
      })

      if (!result.success) {
        // Handle error
      }
    })
  }

  return (
    <form action={handleSubmit}>
      {/* Form fields */}
      <button type="submit" disabled={isPending}>
        {isPending ? 'Submitting...' : 'Submit'}
      </button>
    </form>
  )
}
```

## Performance Optimization

### Image Optimization

- **Use Next.js Image**: Always use `next/image` component
- **Lazy loading**: Enable lazy loading for images below the fold
- **WebP format**: Convert images to WebP format automatically

```typescript
import Image from 'next/image'

export function SpaceCard({ space }: { space: Space }) {
  return (
    <Image
      src={space.imageUrl}
      alt={space.name}
      width={400}
      height={300}
      loading="lazy"
    />
  )
}
```

### Dynamic Imports

- **Large libraries**: Use dynamic imports for large libraries (Three.js, Pixi.js)
- **Code splitting**: Lazy-load components that are not immediately needed

```typescript
import dynamic from 'next/dynamic'

const ThreeJSComponent = dynamic(
  () => import('@/components/public/three-js-component'),
  { ssr: false }
)
```

### Static Generation (generateStaticParams)

- **Pre-render dynamic routes**: Use `generateStaticParams` for dynamic routes that can be pre-rendered
- **Improve performance**: Pre-rendering improves performance and SEO
- **Use in page files**: Export `generateStaticParams` function in page files

```typescript
// src/app/spaces/[id]/page.tsx
import { prisma } from '@/lib/prisma'

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

## Component Composition

- **Composition over inheritance**: Prefer component composition
- **Small components**: Keep components small and focused
- **Reusable components**: Extract reusable UI components to `src/components/ui/`

## Type Safety

- **Props types**: Always define props with `interface` (see `@code-style` for type definitions)
- **Type exports**: Export types for use in other components

**Related Documentation**:
- [`docs/PROJECT_STRUCTURE.md`](../../docs/PROJECT_STRUCTURE.md) - Component organization and patterns
- [`docs/BEST_PRACTICES.md`](../../docs/BEST_PRACTICES.md) - Performance optimization
- [`docs/CACHING_STRATEGY.md`](../../docs/CACHING_STRATEGY.md) - Caching strategies for Server Components
