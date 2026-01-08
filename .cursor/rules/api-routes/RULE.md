---
description: "Standards for API Routes (Route Handlers) in Next.js 16 App Router"
globs:
  - "src/app/api/**"
alwaysApply: false
---

# API Routes Standards

This rule provides guidance for implementing API Routes (Route Handlers) in Next.js 16 App Router.

**Related Rules**: See `@security` for authentication and security patterns, `@code-style` for TypeScript and code style standards.

**Example Files**: 
- `@src/app/api/reservations/route.ts` (if exists)
- `@src/lib/validations/reservation.ts` (validation schemas)
- `@src/lib/auth.ts` (authentication utilities)

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
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const spaceId = searchParams.get('spaceId')

    const reservations = await prisma.reservation.findMany({
      where: spaceId ? { spaceId } : undefined,
    })

    return NextResponse.json({ data: reservations })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = reservationSchema.parse(body)

    const reservation = await prisma.reservation.create({
      data: validatedData,
    })

    return NextResponse.json({ data: reservation }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Validation error',
          code: 'VALIDATION_ERROR',
          details: error.errors,
        },
        { status: 400 }
      )
    }
    console.error('Internal server error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    )
  }
}
```

## Authentication & Authorization

- **Always check authentication**: Verify user session before processing (see `@security` for patterns)
- **Role-based access**: Check user roles for admin endpoints
- **Error responses**: Return appropriate HTTP status codes

```typescript
const session = await auth()
if (!session) {
  return NextResponse.json(
    { error: 'Unauthorized', code: 'AUTHENTICATION_ERROR' },
    { status: 401 }
  )
}

if (session.user.role !== 'admin') {
  return NextResponse.json(
    { error: 'Forbidden', code: 'AUTHORIZATION_ERROR' },
    { status: 403 }
  )
}
```

## Input Validation

- **Use Zod schemas**: Always validate inputs with Zod schemas (see `@security` for validation patterns)
- **Use `safeParse` when accepting `unknown`**: Branch on success and return 400 on failure
- **Avoid `as` casts**: Do not cast request inputs to match types
- **Schema location**: Define schemas in `src/lib/validations/`
- **Error handling**: Return validation errors with 400 status code

```typescript
import { reservationSchema } from '@/lib/validations/reservation'

try {
  const validatedData = reservationSchema.parse(body)
} catch (error) {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        error: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: error.errors,
      },
      { status: 400 }
    )
  }
}
```

## HTTP Status Codes & Response Format

- **Success**: 200 (GET, PUT), 201 (POST)
- **Client errors**: 400 (validation), 401 (unauthorized), 403 (forbidden), 404 (not found)
- **Server errors**: 500 (internal server error)
- **Response format**: Wrap data in `{ data: T }` or `{ error: string }`

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
- **Note**: `updateTag()` and `refresh()` are Server Actions exclusive and cannot be used in Route Handlers

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

## Rate Limiting

- **Implement rate limiting**: Apply rate limiting to prevent abuse and DDoS attacks (see `@security` for patterns)
- **Use `@upstash/ratelimit`**: Use `@upstash/ratelimit` with Redis for distributed rate limiting

```typescript
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { headers } from 'next/headers'

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '15 m'),
})

export async function POST(request: NextRequest) {
  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown'
  
  const { success } = await ratelimit.limit(`api:${ip}`)
  if (!success) {
    return NextResponse.json(
      { error: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED' },
      { status: 429 }
    )
  }
  
  // Continue with request processing
}
```

## Bot Protection (Turnstile)

- **Verify Turnstile tokens**: For form submission endpoints, verify Cloudflare Turnstile tokens (see `@security` for patterns)

```typescript
import { verifyTurnstileToken } from '@/lib/turnstile'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const turnstileResult = await verifyTurnstileToken(body.token)
  if (!turnstileResult.success) {
    return NextResponse.json(
      {
        error: turnstileResult.error || 'Turnstile verification failed',
        code: 'VALIDATION_ERROR', // プロジェクト標準エラーコード
        details: {
          turnstileCode: turnstileResult.code, // Turnstile固有のエラーコードを保持
        },
      },
      { status: 400 }
    )
  }
  
  // Continue with request processing
}
```

## Error Handling

- **Try-catch blocks**: Wrap operations in try-catch blocks
- **Error types**: Handle `z.ZodError` for validation errors, `Prisma.PrismaClientKnownRequestError` for database errors, generic errors for server errors
- **Error codes**: Include `code` field for programmatic error handling
- **Error details**: Include `details` field for additional error information (validation errors, etc.)
- **Logging**: Log errors for debugging (don't expose sensitive information)
- **HTTP status codes**: Use appropriate HTTP status codes (400, 401, 403, 404, 500, etc.)

```typescript
import type { Prisma } from '@/generated/prisma/client'

try {
  // Operation
} catch (error) {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        error: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: error.errors,
      },
      { status: 400 }
    )
  }
  
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return NextResponse.json(
        {
          error: 'Duplicate entry',
          code: 'CONFLICT',
        },
        { status: 409 }
      )
    }
    if (error.code === 'P2025') {
      return NextResponse.json(
        {
          error: 'Record not found',
          code: 'NOT_FOUND',
        },
        { status: 404 }
      )
    }
  }
  
  console.error('Internal server error:', error)
  return NextResponse.json(
    {
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    },
    { status: 500 }
  )
}
```

**Standard error codes**:
- `VALIDATION_ERROR`: Validation errors (Zod errors, etc.) - HTTP 400
- `AUTHENTICATION_ERROR`: Authentication errors (not logged in, etc.) - HTTP 401
- `AUTHORIZATION_ERROR`: Authorization errors (insufficient permissions, etc.) - HTTP 403
- `NOT_FOUND`: Resource not found - HTTP 404
- `CONFLICT`: Resource conflicts (duplicate entries, overlapping time slots, etc.) - HTTP 409
- `RATE_LIMIT_EXCEEDED`: Rate limit exceeded - HTTP 429
- `INTERNAL_ERROR`: Internal server errors (unexpected errors) - HTTP 500

## Type Safety

- **Request/Response types**: Use `NextRequest` and `NextResponse` from `next/server`
- **Type inference**: Leverage Zod schema inference for request/response types (see `@code-style`)

**Related Documentation**:
- [`docs/API.md`](../../docs/API.md) - Detailed API specifications
- [`docs/SECURITY.md`](../../docs/SECURITY.md) - Security best practices
- [`docs/BEST_PRACTICES.md`](../../docs/BEST_PRACTICES.md) - Best practices
