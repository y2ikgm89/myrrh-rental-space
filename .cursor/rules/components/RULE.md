---
description: "Standards for React components (Server Components and Client Components)"
globs:
  - "src/components/**"
alwaysApply: false
---

# Component Standards

This rule provides guidance for implementing React components in Next.js 16 App Router.

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

### File Organization

- **One component per file**: Each component should be in its own file
- **Named exports**: Use named exports for components
- **Props interface**: Define props interface at the top of the file

```typescript
// reservation-form.tsx
interface ReservationFormProps {
  spaceId: string
  onSubmit: (data: ReservationData) => Promise<void>
}

export function ReservationForm({ spaceId, onSubmit }: ReservationFormProps) {
  // Component implementation
}
```

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

```typescript
'use client'

import { useState } from 'react'
import { createReservation } from '@/actions/reservation'

export function ReservationForm({ spaceId }: { spaceId: string }) {
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (formData: FormData) => {
    setIsLoading(true)
    try {
      const result = await createReservation({
        spaceId,
        date: formData.get('date') as string,
        // ... other fields
      })

      if (!result.success) {
        // Handle error
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form action={handleSubmit}>
      {/* Form fields */}
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

## Component Composition

- **Composition over inheritance**: Prefer component composition
- **Small components**: Keep components small and focused
- **Reusable components**: Extract reusable UI components to `src/components/ui/`

## Type Safety

- **Props types**: Always define props with `interface` or `type`
- **Explicit types**: Use explicit types for component props
- **Type exports**: Export types for use in other components

For detailed component patterns, see [`docs/PROJECT_STRUCTURE.md`](../../docs/PROJECT_STRUCTURE.md).
