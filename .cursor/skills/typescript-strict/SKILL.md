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

### Type Safety with Zod

- **Use Zod schemas**: For runtime validation and type inference
- **Infer types**: Use `z.infer` for type inference from Zod schemas

```typescript
// ✅ Good: Zod schema with type inference
import { z } from 'zod'

const createSpaceSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(2000),
  capacity: z.number().int().positive(),
  hourlyPrice: z.number().nonnegative(),
})

type CreateSpaceInput = z.infer<typeof createSpaceSchema>

export async function createSpace(data: CreateSpaceInput): Promise<{ success: boolean; spaceId?: string }> {
  const validatedData = createSpaceSchema.parse(data)
  // ... implementation
}
```

### Prisma Types

- **Use Prisma types**: Import types from `@prisma/client`
- **Use `Prisma.SpaceCreateInput`**: For Prisma input types
- **Use `Prisma.SpaceUpdateInput`**: For Prisma update types

```typescript
// ✅ Good: Prisma types
import { Prisma } from '@prisma/client'

export async function createSpace(data: Prisma.SpaceCreateInput): Promise<Space> {
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
- **Use discriminated unions**: For error handling

```typescript
// ✅ Good: Error types
type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown }

export async function createSpace(data: CreateSpaceInput): Promise<Result<Space>> {
  try {
    const space = await prisma.space.create({ data })
    return { success: true, data: space }
  } catch (error) {
    return {
      success: false,
      error: 'Failed to create space',
      details: error,
    }
  }
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
import { PrismaClient } from '@prisma/client'

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
2. **Type inference**: Use type inference when types are clear
3. **Zod schemas**: Use Zod for runtime validation and type inference
4. **Prisma types**: Use Prisma-generated types for database operations
5. **Type guards**: Use type guards for runtime type checking
6. **Error types**: Define specific error types for better error handling
7. **Import order**: Follow consistent import order

## References

- [TypeScript Documentation](https://www.typescriptlang.org/docs)
- [TypeScript Strict Mode](https://www.typescriptlang.org/tsconfig#strict)
- Project documentation: `AGENTS.md` (Code style section)
