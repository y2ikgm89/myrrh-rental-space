---
name: typescript-strict
description: Provides guidance for writing type-safe TypeScript code with strict mode enabled, including explicit type annotations and best practices. Use when writing TypeScript code, defining function parameters and return types, working with types and interfaces, handling type errors, or writing type-safe code.
compatibility: Designed for Cursor (or similar AI coding assistants). Requires TypeScript with strict mode enabled.
metadata:
  author: myrrh-rental-space
  version: "1.0.0"
  language: "TypeScript"
---

# TypeScript Strict Mode

This skill provides guidance for writing type-safe TypeScript code with strict mode enabled, including explicit type annotations and best practices.

## When to use this skill

Use this skill when:
- Writing TypeScript code
- Defining function parameters and return types
- Working with types and interfaces
- Handling type errors
- Writing type-safe code

## Examples

**Example 1**: "Create a function to get a space by ID"
- This skill will guide you to add explicit type annotations for parameters (`id: string`) and return type (`Promise<Space | null>`), ensuring type safety.

**Example 2**: "Define props for a SpaceCard component"
- This skill will guide you to use `interface` or `type` for component props, export types for reuse, and ensure all props are properly typed.

**Example 3**: "Create a Zod schema for form validation"
- This skill will guide you to use `z.infer` for type inference, combine runtime validation with type safety, and use Prisma types when appropriate.

## Instructions

### Explicit Type Annotations

- **Function parameters**: Always annotate function parameters
- **Return types**: Always annotate return types
- **Variables**: Use type inference when possible, but annotate when unclear
- **Avoid `any`**: Use `unknown` instead of `any` and validate with type guards

```typescript
// ✅ Good: Explicit type annotations
export async function getSpaceById(id: string): Promise<Space | null> {
  return await prisma.space.findUnique({
    where: { id },
  })
}

// ✅ Good: Type inference for simple cases
const spaces = await prisma.space.findMany() // Type inferred from Prisma

// ✅ Good: Explicit type when needed
const spaceIds: string[] = spaces.map(space => space.id)

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
```

### TypeScript 5.9 Features

- **`satisfies` operator**: Use `satisfies` to validate types while preserving inference
- **Utility types**: Leverage `Partial<T>`, `Required<T>`, `Pick<T>`, `Omit<T>`, etc.

```typescript
// ✅ Good: Using `satisfies` operator
const config = {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
  retries: 3,
} satisfies {
  apiUrl: string
  timeout: number
  retries: number
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

### Component Props

- **Use `interface` or `type`**: Define component props with explicit types
- **Export types**: Export types for reuse

```typescript
// ✅ Good: Component props with interface
interface SpaceCardProps {
  space: {
    id: string
    name: string
    mainImageUrl: string
    hourlyPrice: number
  }
}

export function SpaceCard({ space }: SpaceCardProps) {
  return (
    <div>
      <h2>{space.name}</h2>
      <img src={space.mainImageUrl} alt={space.name} />
      <p>¥{space.hourlyPrice}/hour</p>
    </div>
  )
}
```

### Type Safety with Zod 4.3.5

- **Use Zod schemas**: For runtime validation and type inference
- **Infer types**: Use `z.infer` for type inference from Zod schemas
- **Use `z.input` and `z.output`**: Distinguish between input and output types when using transforms
- **Use `safeParse` at boundaries**: Validate `unknown` inputs and branch on success instead of casting

```typescript
// ✅ Good: Zod schema with type inference
import { z } from 'zod'

const createSpaceSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(2000),
  capacity: z.number().int().positive(),
  hourlyPrice: z.number().nonnegative(),
})

// z.infer: Inferred type (usually same as z.output)
type CreateSpaceInput = z.infer<typeof createSpaceSchema>

// z.input: Input type (before transforms)
type CreateSpaceInputRaw = z.input<typeof createSpaceSchema>

// z.output: Output type (after transforms)
type CreateSpaceOutput = z.output<typeof createSpaceSchema>

export async function createSpace(
  data: CreateSpaceInput
): Promise<{ success: boolean; spaceId?: string }> {
  // parse() returns z.output type
  const validatedData = createSpaceSchema.parse(data)
  // ... implementation
}

// ✅ Good: Using Zod schema as type guard
function isSpace(data: unknown): data is z.infer<typeof createSpaceSchema> {
  return createSpaceSchema.safeParse(data).success
}

// ✅ Good: Boundary validation without casting
const result = createSpaceSchema.safeParse(input)
if (!result.success) {
  throw new Error('Invalid input')
}
const validated = result.data
```

### Prisma 7 Types

- **Use Prisma types**: Import types from `@/generated/prisma/client` (Prisma 7 requires custom output path)
- **Use `Prisma.SpaceCreateInput`**: For Prisma input types
- **Use `Prisma.SpaceUpdateInput`**: For Prisma update types
- **Use `Prisma.SpaceGetPayload`**: For custom types with select/include
- **Leverage type inference**: Prisma automatically infers types from select/include

```typescript
// ✅ Good: Prisma types (Prisma 7)
import type { Prisma } from '@/generated/prisma/client'

export async function createSpace(
  data: Prisma.SpaceCreateInput
): Promise<Space> {
  return await prisma.space.create({
    data,
  })
}

export async function updateSpace(
  id: string,
  data: Prisma.SpaceUpdateInput
): Promise<Space> {
  return await prisma.space.update({
    where: { id },
    data,
  })
}

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
// spaceの型は自動的に推論される: { id: string; name: string; hourlyPrice: number }
```

### Type Guards

- **Use type guards**: For runtime type checking
- **Use `instanceof`**: For class instances
- **Use custom type guards**: For complex type checks

```typescript
// ✅ Good: Type guards
function isSpace(obj: unknown): obj is Space {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'name' in obj &&
    'hourlyPrice' in obj
  )
}

export function processSpace(data: unknown): Space {
  if (isSpace(data)) {
    return data
  }
  throw new Error('Invalid space data')
}
```

### Error Handling Types

- **Use error types**: Define specific error types
- **Use discriminated unions**: For error handling with type narrowing
- **Handle specific error types**: Use `instanceof` for type guards

```typescript
// ✅ Good: Discriminated union for error handling
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
    // Type narrowing with instanceof
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
          code: 'DUPLICATE_ENTRY',
        }
      }
    }

    return {
      success: false,
      error: 'An unexpected error occurred',
      code: 'UNKNOWN_ERROR',
      details: error,
    }
  }
}

// ✅ Good: Using discriminated union with type narrowing
const result = await createSpace(data)
if (result.success) {
  // TypeScript knows result.data exists here
  console.log(result.data.name)
} else {
  // TypeScript knows result.error exists here
  console.error(result.error, result.code)
}
```

### React 19 + Next.js 16 Type Safety

- **Server Components**: Use proper types for params (Promise in Next.js 16)
- **Server Actions**: Use Zod schemas for type inference
- **Promise types**: Explicitly type Promise props for React 19's `use()` hook

```typescript
// ✅ Good: Server Component with proper types
interface PageProps {
  params: Promise<{ id: string }>
}

export default async function SpacePage({ params }: PageProps) {
  const { id } = await params // Next.js 16: params is Promise
  
  const space = await prisma.space.findUnique({
    where: { id },
  })
  
  if (!space) {
    notFound()
  }
  
  return <SpaceDetails space={space} />
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

### Import Order

- **Follow import order**: React/Next.js → third-party → internal → relative → type-only

```typescript
// ✅ Good: Import order
// 1. React/Next.js
import { useState } from 'react'
import { NextRequest } from 'next/server'

// 2. Third-party libraries
import { z } from 'zod'
import { PrismaClient } from '@/generated/prisma/client'

// 3. Internal modules (@/ alias)
import { prisma } from '@/lib/prisma'
import { Button } from '@/components/ui/button'

// 4. Relative imports
import { formatDate } from './utils'

// 5. Type-only imports
import type { Reservation } from '@/types/reservation'
```

## Best Practices

1. **Explicit types**: Always annotate function parameters and return types
2. **Type inference**: Use type inference when types are clear (e.g., Prisma queries)
3. **Avoid `any`**: Use `unknown` instead and validate with type guards
4. **Zod schemas**: Use Zod 4.3.5 for runtime validation and type inference (`z.infer`, `z.input`, `z.output`)
5. **Prisma types**: Use Prisma 7-generated types (`Prisma.*`, `Prisma.GetPayload`)
6. **Type guards**: Use type guards (`instanceof`, custom guards) for runtime type checking
7. **Error types**: Use discriminated unions for type-safe error handling
8. **React 19/Next.js 16**: Use proper types for Server Components (Promise params) and Server Actions
9. **Type reuse**: Follow DRY principle, centralize type definitions
10. **Import order**: Follow consistent import order (React/Next.js → third-party → internal → relative → type-only)

## References

- [TypeScript Documentation](https://www.typescriptlang.org/docs)
- [TypeScript Strict Mode](https://www.typescriptlang.org/tsconfig#strict)
- Project documentation: `AGENTS.md` (Code style section)
