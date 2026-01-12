---
name: better-auth
description: Provides guidance for implementing authentication and authorization with Better Auth, including session management, Prisma adapter, and security best practices. Use when implementing authentication flows, working with sessions, protecting routes and Server Actions, implementing role-based access control (RBAC), or configuring Better Auth providers.
compatibility: Designed for Cursor (or similar AI coding assistants)
metadata:
  author: myrrh-rental-space
  version: "1.0.0"
  framework: "Better Auth 1.x"
---

# Better Auth

This skill provides guidance for implementing authentication and authorization with Better Auth, including session management, Prisma adapter, and security best practices.

## When to use this skill

Use this skill when:
- Implementing authentication flows
- Working with sessions
- Protecting routes and Server Actions
- Implementing role-based access control (RBAC)
- Configuring Better Auth providers

## Examples

**Example 1**: "Add authentication to the admin dashboard page"
- This skill will guide you to use `getSession()` in Server Components, check roles, and redirect unauthorized users.

**Example 2**: "Create a login form with Better Auth"
- This skill will guide you to use `signIn()` from `@/lib/auth-client`, handle errors, and configure callbacks.

**Example 3**: "Protect the createSpace Server Action with admin-only access"
- This skill will guide you to check authentication and roles in Server Actions, and throw appropriate errors.

## Instructions

### Better Auth Configuration

- **Use Prisma Adapter**: For database-backed sessions
- **Use nextCookies plugin**: For Server Actions cookie handling
- **Configure session**: For custom session data (roles, etc.)

```typescript
// ✅ Good: Better Auth configuration
// src/lib/auth.ts
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { nextCookies } from 'better-auth/next-js'
import { prisma } from '@/lib/prisma'

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
  emailAndPassword: { enabled: true },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  user: {
    additionalFields: {
      role: { type: 'string', defaultValue: 'USER' },
    },
  },
  plugins: [nextCookies()],
})

export type Session = typeof auth.$Infer.Session
```

### Session Management

- **Use cookie-based sessions**: Better Auth uses secure cookie-based sessions
- **Configure expiration**: Set appropriate session expiration
- **Use cookieCache**: For performance optimization

```typescript
// ✅ Good: Session configuration
export const auth = betterAuth({
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days in seconds
    updateAge: 60 * 60 * 24, // Update every 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // Cache for 5 minutes
    },
  },
})
```

### Authentication Checks in Server Actions

- **Always check authentication**: Verify session in all Server Actions
- **Check roles**: Verify user roles for admin operations
- **Throw errors**: Throw errors for unauthorized access

```typescript
// ✅ Good: Authentication check in Server Actions
'use server'

import { getSession } from '@/lib/auth'

export async function createSpace(data: CreateSpaceData) {
  const session = await getSession()

  if (!session?.user || session.user.role !== 'ADMIN') {
    throw new Error('Unauthorized')
  }

  // ... implementation
}
```

### Route Protection with Proxy

- **Use Proxy**: For route-level protection (Next.js 16)
- **Use getSessionCookie**: For fast cookie-only checks
- **Check roles in Server Components**: For detailed role checks

```typescript
// ✅ Good: Proxy for route protection (Next.js 16)
// src/proxy.ts
import { NextResponse, type NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl

  if (pathname.startsWith('/admin')) {
    const sessionCookie = getSessionCookie(req)

    if (!sessionCookie) {
      return NextResponse.redirect(new URL('/login', req.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
```

### Session Access in Server Components

- **Use `getSession()`**: For getting session in Server Components
- **Handle null sessions**: Always check for null sessions
- **Use cache()**: For DAL pattern optimization

```typescript
// ✅ Good: Session access in Server Components
import { getSession, verifySession } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function AdminPage() {
  const session = await getSession()

  if (!session?.user || session.user.role !== 'ADMIN') {
    redirect('/login')
  }

  return <div>Admin content</div>
}

// Or use verifySession for strict checks (throws on unauthorized)
export default async function StrictAdminPage() {
  const user = await verifySession() // Throws if not admin

  return <div>Welcome, {user.name}</div>
}
```

### Client-Side Authentication

- **Use auth-client**: For client-side authentication
- **Handle errors**: Always handle authentication errors

```typescript
// ✅ Good: Client-side authentication
// src/lib/auth-client.ts
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
})

export const { signIn, signOut, useSession, getSession } = authClient
```

```typescript
// ✅ Good: Sign in and sign out
'use client'

import { signIn, signOut } from '@/lib/auth-client'

export function LoginButton() {
  async function handleSignIn() {
    try {
      await signIn.email({
        email: email,
        password: password,
        callbackURL: '/admin',
      })
    } catch (error) {
      console.error('Sign in error:', error)
    }
  }

  return <button onClick={handleSignIn}>Sign In</button>
}

export function LogoutButton() {
  async function handleSignOut() {
    await signOut({ fetchOptions: { onSuccess: () => window.location.href = '/' } })
  }

  return <button onClick={handleSignOut}>Sign Out</button>
}
```

### Role-Based Access Control (RBAC)

- **Check roles**: Always verify user roles for admin operations
- **Use proxy**: For route-level role checks
- **Use Server Actions**: For operation-level role checks

```typescript
// ✅ Good: Role-based access control
export async function deleteSpace(spaceId: string) {
  const session = await getSession()

  if (!session?.user) {
    throw new Error('Unauthorized')
  }

  if (session.user.role !== 'ADMIN') {
    throw new Error('Forbidden: Admin access required')
  }

  // ... implementation
}
```

### API Route Handler

- **Use toNextJsHandler**: For API route handling
- **Export GET and POST**: For authentication endpoints

```typescript
// ✅ Good: API route handler
// src/app/api/auth/[...all]/route.ts
import { auth } from '@/lib/auth'
import { toNextJsHandler } from 'better-auth/next-js'

export const { GET, POST } = toNextJsHandler(auth)
```

## Security Best Practices

1. **Always validate authentication**: Check session in all protected operations
2. **Check roles**: Verify user roles for admin operations
3. **Use secure cookies**: Better Auth uses secure cookies by default
4. **Handle errors**: Always handle authentication errors gracefully
5. **Use HTTPS**: Always use HTTPS in production
6. **Session expiration**: Set appropriate session expiration times
7. **Use scrypt**: Better Auth uses scrypt for password hashing (default)
8. **Environment variables**: Set `BETTER_AUTH_SECRET` for production

## Environment Variables

```bash
# Required
BETTER_AUTH_SECRET=your-secret-key-at-least-32-characters
BETTER_AUTH_URL=https://your-domain.com

# Optional (for Google OAuth)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

## References

- [Better Auth Documentation](https://www.better-auth.com/docs)
- [Better Auth Security](https://www.better-auth.com/docs/concepts/security)
- [Better Auth Prisma Adapter](https://www.better-auth.com/docs/adapters/prisma)
- Project documentation: `docs/security/authentication.md`, `docs/guides/coding-standards.md`
