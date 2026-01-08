---
description: "Code style standards for TypeScript, React, and Next.js components"
alwaysApply: true
---

# Code Style Standards

This rule enforces consistent code style across the project.

**Related Rules**: This rule is referenced by `@components`, `@api-routes`, `@server-actions`, and `@testing` for code style consistency.

## TypeScript

- **Strict mode**: TypeScript strict mode is enabled (`strict: true` in `tsconfig.json`)
- **Explicit types**: Always provide explicit type annotations for function parameters and return values
- **Type definitions**: Use `interface` for object shapes that may be extended (component props, API responses), `type` for unions, intersections, or computed types
- **Type inference**: Use type inference when types are clear (e.g., Prisma query results), but annotate when unclear
- **Avoid `any`**: Use `unknown` instead of `any` and validate with type guards
- **Type guards**: Use `instanceof` for class instances (e.g., `error instanceof z.ZodError`) or custom type guards with `is` keyword for complex checks
- **Utility types**: Leverage TypeScript utility types (`Partial<T>`, `Required<T>`, `Pick<T>`, `Omit<T>`, etc.)
- **`satisfies` operator**: Use `satisfies` to validate types while preserving inference (TypeScript 5.9+)
- **Variable declarations**: Use `const` by default, `let` only when reassignment is needed, never use `var`

```typescript
// ✅ Good: interface for component props
interface SpaceCardProps {
  space: Space
  onSelect?: (id: string) => void
}

// ✅ Good: type for unions
type Status = 'pending' | 'confirmed' | 'cancelled'

// ✅ Good: Explicit return type
export async function getReservation(
  id: string
): Promise<{ success: boolean; data?: Reservation }> {
  // Implementation
}

// ✅ Good: Type guard for error handling
if (error instanceof z.ZodError) {
  return { success: false, error: 'Validation error', details: error.errors }
}

// ❌ Bad: Using `any`
function processData(data: any) {
  return data.name.toUpperCase() // No type safety
}

// ✅ Good: Using `unknown` with type guard
function processData(data: unknown): string {
  if (typeof data === 'object' && data !== null && 'name' in data) {
    if (typeof data.name === 'string') {
      return data.name.toUpperCase()
    }
  }
  throw new Error('Invalid data')
}

// ✅ Good: Using `satisfies` operator (TypeScript 5.9+)
const config = {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
} satisfies {
  apiUrl: string
  timeout: number
}

// ✅ Good: Utility types
interface User {
  id: string
  name: string
  email: string
}

type UserUpdate = Partial<User>
type UserPublic = Pick<User, 'id' | 'name'>
type UserWithoutId = Omit<User, 'id'>
```

## Naming Conventions

- **Components**: PascalCase (`ReservationForm`, `SpaceCard`)
- **Functions/Variables**: camelCase (`getReservationById`, `isLoading`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_RESERVATION_HOURS`, `DEFAULT_PAGE_SIZE`)
- **File names**: kebab-case (`reservation-form.tsx`, `space-card.tsx`)

## Formatting

- **Quotes**: Single quotes (follow Prettier config)
- **Semicolons**: No semicolons (follow Prettier config)
- **Import order**: React/Next.js → Third-party libraries → Internal modules (`@/`) → Relative imports → Type-only imports

```typescript
// 1. React/Next.js
import { useState } from 'react'
import { NextRequest } from 'next/server'

// 2. Third-party libraries
import { z } from 'zod'

// 3. Internal modules
import { prisma } from '@/lib/prisma'

// 4. Relative imports
import { formatDate } from './utils'

// 5. Type-only imports
import type { Reservation } from '@/types/reservation'
```

## React Components

- **Server Components by default**: Use Server Components unless client-side interactivity is required
- **Client Components**: Use `'use client'` directive explicitly when needed
- **Props**: Define component props with `interface` at the top of the file

```typescript
interface ReservationFormProps {
  spaceId: string
  onSubmit: (data: ReservationData) => Promise<void>
}

export function ReservationForm({ spaceId, onSubmit }: ReservationFormProps) {
  // Component implementation
}
```

## Comments

- **Add detailed comments**: Document functions, classes, and complex logic with JSDoc format
- **Function comments**: Document purpose, parameters, return values, and important behavior
- **Complex logic**: Explain non-obvious logic, algorithms, or business rules

```typescript
/**
 * Creates a new reservation for a space.
 * 
 * @param data - Reservation data including spaceId, customer info, and time slots
 * @returns Promise resolving to success status and reservation ID or error message
 */
export async function createReservation(
  data: ReservationData
): Promise<{ success: boolean; reservationId?: string; error?: string }> {
  // Implementation
}
```

## Type Inference with Zod 4.3.5

- **Use `z.infer`**: Infer TypeScript types from Zod schemas for type safety (usually same as `z.output`)
- **Use `z.input`**: For input types (before transforms)
- **Use `z.output`**: For output types (after transforms)
- **Use `safeParse` at boundaries**: Validate `unknown` inputs and branch on success instead of casting
- **Avoid `as` for inputs**: Prefer schema validation to establish types
- **Type guards**: Use Zod schemas as type guards with `safeParse()`

```typescript
const createReservationSchema = z.object({
  spaceId: z.string().uuid(),
  startTime: z.date(),
  endTime: z.date(),
})

// z.infer: Inferred type (usually same as z.output)
type CreateReservationInput = z.infer<typeof createReservationSchema>

// z.input: Input type (before transforms, if using z.preprocess)
type CreateReservationInputRaw = z.input<typeof createReservationSchema>

// z.output: Output type (after transforms, if using z.transform)
type CreateReservationOutput = z.output<typeof createReservationSchema>

// ✅ Good: Using Zod schema as type guard
function isReservation(data: unknown): data is CreateReservationInput {
  return createReservationSchema.safeParse(data).success
}
```

## File Organization

- **One component per file**: Each component should be in its own file
- **Named exports**: Use named exports for components
- **Default exports**: Avoid default exports (except for pages in `src/app/`)

## Prisma 7 Type Safety

- **Use Prisma types**: Import types from `@/generated/prisma/client`
- **Leverage type inference**: Prisma automatically infers types from `select` and `include`
- **Use `Prisma.GetPayload`**: For custom types with select/include

```typescript
import type { Prisma } from '@/generated/prisma/client'

// ✅ Good: Prisma input types
type SpaceCreateInput = Prisma.SpaceCreateInput
type SpaceUpdateInput = Prisma.SpaceUpdateInput

// ✅ Good: Custom types with Prisma.GetPayload
type SpaceWithReservations = Prisma.SpaceGetPayload<{
  include: {
    reservations: true
  }
}>

type SpacePublic = Prisma.SpaceGetPayload<{
  select: {
    id: true
    name: true
    hourlyPrice: true
  }
}>

// ✅ Good: Type inference from select/include
const space = await prisma.space.findUnique({
  where: { id },
  select: {
    id: true,
    name: true,
    hourlyPrice: true,
  },
})
// spaceの型は自動的に推論される
```

## React 19 + Next.js 16 Type Safety

- **Server Components**: Use `Promise<{ ... }>` for params in Next.js 16
- **Server Actions**: Use Zod schemas for type inference
- **Promise types**: Explicitly type Promise props for React 19's `use()` hook

```typescript
// ✅ Good: Server Component with proper types
interface PageProps {
  params: Promise<{ id: string }>
}

export default async function SpacePage({ params }: PageProps) {
  const { id } = await params // Next.js 16: params is Promise
  // ...
}

// ✅ Good: Server Action with type safety
'use server'

type CreateSpaceInput = z.infer<typeof createSpaceSchema>
type CreateSpaceResult =
  | { success: true; spaceId: string }
  | { success: false; error: string }

export async function createSpace(
  data: CreateSpaceInput
): Promise<CreateSpaceResult> {
  // Implementation
}

// ✅ Good: Promise type for React 19's use() hook
interface CommentsProps {
  commentsPromise: Promise<Comment[]>
}

function Comments({ commentsPromise }: CommentsProps) {
  const comments = use(commentsPromise) // Type is guaranteed
  return <div>{/* ... */}</div>
}
```

**Related Documentation**:
- [`.cursor/skills/typescript-strict/SKILL.md`](../../.cursor/skills/typescript-strict/SKILL.md) - TypeScript strict mode best practices
- [`docs/BEST_PRACTICES.md`](../../docs/BEST_PRACTICES.md) - General best practices (includes comprehensive type safety section)
