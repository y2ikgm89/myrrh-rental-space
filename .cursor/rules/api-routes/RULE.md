---
description: "Standards for API Routes (Route Handlers) in Next.js 16 App Router"
globs:
  - "src/app/api/**"
alwaysApply: false
---

# API Routes Standards

This rule provides guidance for implementing API Routes (Route Handlers) in Next.js 16 App Router.

## Route Handler Location

- **Directory**: `src/app/api/` for API routes
- **File naming**: Use `route.ts` or `route.tsx` for route handlers
- **HTTP methods**: Export named functions for HTTP methods (`GET`, `POST`, `PUT`, `DELETE`, etc.)

## Route Handler Structure

### Basic Pattern

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { reservationSchema } from '@/lib/validations/reservation'

export async function GET(request: NextRequest) {
  try {
    // 1. Authentication check
    const session = await auth()
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // 2. Query parameters
    const searchParams = request.nextUrl.searchParams
    const spaceId = searchParams.get('spaceId')

    // 3. Database query
    const reservations = await prisma.reservation.findMany({
      where: spaceId ? { spaceId } : undefined,
    })

    // 4. Response
    return NextResponse.json({ data: reservations })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    // 1. Authentication check
    const session = await auth()
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // 2. Parse request body
    const body = await request.json()

    // 3. Input validation
    const validatedData = reservationSchema.parse(body)

    // 4. Business logic
    const reservation = await prisma.reservation.create({
      data: validatedData,
    })

    // 5. Response
    return NextResponse.json(
      { data: reservation },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

## Authentication & Authorization

- **Always check authentication**: Verify user session before processing
- **Role-based access**: Check user roles for admin endpoints
- **Error responses**: Return appropriate HTTP status codes

```typescript
const session = await auth()
if (!session) {
  return NextResponse.json(
    { error: 'Unauthorized' },
    { status: 401 }
  )
}

// For admin endpoints
if (session.user.role !== 'admin') {
  return NextResponse.json(
    { error: 'Forbidden' },
    { status: 403 }
  )
}
```

## Input Validation

- **Use Zod schemas**: Always validate inputs with Zod schemas
- **Schema location**: Define schemas in `src/lib/validations/`
- **Error handling**: Return validation errors with 400 status code

```typescript
import { reservationSchema } from '@/lib/validations/reservation'

try {
  const validatedData = reservationSchema.parse(body)
} catch (error) {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: 'Validation error', details: error.errors },
      { status: 400 }
    )
  }
}
```

## HTTP Status Codes

- **200 OK**: Successful GET, PUT requests
- **201 Created**: Successful POST requests
- **400 Bad Request**: Validation errors, invalid input
- **401 Unauthorized**: Missing or invalid authentication
- **403 Forbidden**: Insufficient permissions
- **404 Not Found**: Resource not found
- **500 Internal Server Error**: Server errors

## Response Format

- **Consistent format**: Use consistent response format
- **Error messages**: Provide clear error messages
- **Data structure**: Wrap data in `{ data: T }` or `{ error: string }`

```typescript
// Success response
return NextResponse.json({ data: reservation })

// Error response
return NextResponse.json(
  { error: 'Resource not found' },
  { status: 404 }
)
```

## Caching

- **Cache control**: Use `export const revalidate` for cache control
- **Dynamic routes**: Use `export const dynamic = 'force-dynamic'` for dynamic routes
- **No cache for authenticated data**: Use `unstable_noStore()` for authenticated data

```typescript
// Static route with revalidation
export const revalidate = 3600 // 1 hour

// Dynamic route (no cache)
export const dynamic = 'force-dynamic'

// Or use unstable_noStore()
import { unstable_noStore } from 'next/cache'

export async function GET() {
  unstable_noStore()
  // Implementation
}
```

## Runtime Configuration

- **Bun runtime**: This project uses Bun runtime (Node.js compatible)
- **Edge runtime**: Not supported (Prisma requires Node.js runtime)
- **Explicit runtime**: Specify `runtime = "nodejs"` if needed (Bun has Node.js compatibility)

```typescript
export const runtime = 'nodejs' // Bun runtime (Node.js compatible)
```

## Error Handling

- **Try-catch blocks**: Wrap operations in try-catch blocks
- **Error types**: Handle different error types appropriately
- **Logging**: Log errors for debugging (don't expose sensitive information)

```typescript
try {
  // Operation
} catch (error) {
  console.error('Error:', error)
  
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: 'Validation error', details: error.errors },
      { status: 400 }
    )
  }

  return NextResponse.json(
    { error: 'Internal server error' },
    { status: 500 }
  )
}
```

## Type Safety

- **Request types**: Use `NextRequest` from `next/server`
- **Response types**: Use `NextResponse` from `next/server`
- **Type inference**: Leverage Zod schema inference for request/response types

For detailed API specifications, see [`docs/API.md`](../../docs/API.md).
