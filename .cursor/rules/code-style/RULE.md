---
description: "Code style standards for TypeScript, React, and Next.js components"
alwaysApply: true
---

# Code Style Standards

This rule enforces consistent code style across the project.

## TypeScript

- **Strict mode**: TypeScript strict mode is enabled
- **Explicit types**: Always provide explicit type annotations for function parameters and return values
- **Type definitions**: Use `interface` or `type` for component props and complex types

## Naming Conventions

- **Components**: PascalCase (`ReservationForm`, `SpaceCard`)
- **Functions/Variables**: camelCase (`getReservationById`, `isLoading`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_RESERVATION_HOURS`, `DEFAULT_PAGE_SIZE`)
- **File names**: kebab-case (`reservation-form.tsx`, `space-card.tsx`)

## Formatting

- **Quotes**: Single quotes (follow Prettier config)
- **Semicolons**: No semicolons (follow Prettier config)
- **Import order**:
  1. React/Next.js imports
  2. Third-party libraries
  3. Internal modules (`@/` aliases)
  4. Relative imports
  5. Type-only imports (`import type`)

Example:
```typescript
// 1. React/Next.js
import { useState } from 'react'
import { NextRequest } from 'next/server'

// 2. Third-party libraries
import { z } from 'zod'
import { PrismaClient } from '@prisma/client'

// 3. Internal modules
import { prisma } from '@/lib/prisma'
import { Button } from '@/components/ui/button'

// 4. Relative imports
import { formatDate } from './utils'

// 5. Type-only imports
import type { Reservation } from '@/types/reservation'
```

## React Components

- **Server Components by default**: Use Server Components unless client-side interactivity is required
- **Client Components**: Use `'use client'` directive explicitly when needed
- **Props**: Define component props with `interface` or `type` at the top of the file

Example:
```typescript
interface ReservationFormProps {
  spaceId: string
  onSubmit: (data: ReservationData) => Promise<void>
}

export function ReservationForm({ spaceId, onSubmit }: ReservationFormProps) {
  // Component implementation
}
```

## File Organization

- **One component per file**: Each component should be in its own file
- **Named exports**: Use named exports for components
- **Default exports**: Avoid default exports (except for pages in `src/app/`)
