---
name: authjs-5
description: Provides guidance for implementing authentication and authorization with Auth.js 5, including JWT sessions, Prisma adapter, and security best practices. Use when implementing authentication flows, working with sessions, protecting routes and Server Actions, implementing role-based access control (RBAC), or configuring Auth.js providers.
compatibility: Designed for Cursor (or similar AI coding assistants)
metadata:
  author: myrrh-rental-space
  version: "1.0.0"
  framework: "Auth.js 5"
---

# Auth.js 5

This skill provides guidance for implementing authentication and authorization with Auth.js 5, including JWT sessions, Prisma adapter, and security best practices.

## When to use this skill

Use this skill when:
- Implementing authentication flows
- Working with sessions
- Protecting routes and Server Actions
- Implementing role-based access control (RBAC)
- Configuring Auth.js providers

## Examples

**Example 1**: "Add authentication to the admin dashboard page"
- This skill will guide you to use `auth()` in Server Components, check roles, and redirect unauthorized users.

**Example 2**: "Create a login form with Auth.js"
- This skill will guide you to use `signIn()` from `next-auth/react`, handle errors, and configure callbacks.

**Example 3**: "Protect the createSpace Server Action with admin-only access"
- This skill will guide you to check authentication and roles in Server Actions, and throw appropriate errors.

## Instructions

### Auth.js Configuration

- **Use Prisma Adapter**: For database-backed sessions (if using database strategy)
- **Use JWT Strategy**: Recommended for better performance (default in this project)
- **Configure callbacks**: For custom session data (roles, etc.)

```typescript
// ✅ Good: Auth.js 5 configuration
// src/lib/auth.ts
import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/prisma'
import authConfig from './auth.config'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  ...authConfig,
})
```

### JWT Session Strategy

- **Use JWT sessions**: Recommended for better performance
- **Configure maxAge**: Set appropriate session expiration
- **Use callbacks**: For custom token and session data

```typescript
// ✅ Good: JWT session configuration
export const authOptions = {
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // Update every 24 hours
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.role = token.role
      }
      return session
    },
  },
}
```

### Authentication Checks in Server Actions

- **Always check authentication**: Verify session in all Server Actions
- **Check roles**: Verify user roles for admin operations
- **Throw errors**: Throw errors for unauthorized access

```typescript
// ✅ Good: Authentication check in Server Actions
'use server'

import { auth } from '@/lib/auth'

export async function createSpace(data: CreateSpaceData) {
  const session = await auth()
  
  if (!session || session.user.role !== 'admin') {
    throw new Error('Unauthorized')
  }

  // ... implementation
}
```

### Route Protection with Middleware

- **Use Middleware**: For route-level protection
- **Check authentication**: Verify session in middleware
- **Check roles**: Verify user roles for admin routes

```typescript
// ✅ Good: Proxy for route protection (Next.js 16)
// src/proxy.ts
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const { pathname } = req.nextUrl
  const session = req.auth

  // Protect admin routes
  if (pathname.startsWith('/admin')) {
    if (!session || session.user.role !== 'admin') {
      return NextResponse.redirect(new URL('/login', req.url))
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
```

### Session Access in Server Components

- **Use `auth()`**: For getting session in Server Components
- **Handle null sessions**: Always check for null sessions

```typescript
// ✅ Good: Session access in Server Components
import { auth } from '@/lib/auth'

export default async function AdminPage() {
  const session = await auth()
  
  if (!session || session.user.role !== 'admin') {
    redirect('/login')
  }

  return <div>Admin content</div>
}
```

### Sign In and Sign Out

- **Use `signIn()`**: For programmatic sign in
- **Use `signOut()`**: For programmatic sign out
- **Handle errors**: Always handle authentication errors

```typescript
// ✅ Good: Sign in and sign out
'use client'

import { signIn, signOut } from 'next-auth/react'

export function LoginButton() {
  async function handleSignIn() {
    try {
      await signIn('credentials', {
        email: email,
        password: password,
        redirect: true,
        callbackUrl: '/admin',
      })
    } catch (error) {
      console.error('Sign in error:', error)
    }
  }

  return <button onClick={handleSignIn}>Sign In</button>
}

export function LogoutButton() {
  async function handleSignOut() {
    await signOut({ redirect: true, callbackUrl: '/' })
  }

  return <button onClick={handleSignOut}>Sign Out</button>
}
```

### Role-Based Access Control (RBAC)

- **Check roles**: Always verify user roles for admin operations
- **Use middleware**: For route-level role checks
- **Use Server Actions**: For operation-level role checks

```typescript
// ✅ Good: Role-based access control
export async function deleteSpace(spaceId: string) {
  const session = await auth()
  
  if (!session) {
    throw new Error('Unauthorized')
  }

  if (session.user.role !== 'admin') {
    throw new Error('Forbidden: Admin access required')
  }

  // ... implementation
}
```

## Security Best Practices

1. **Always validate authentication**: Check session in all protected operations
2. **Check roles**: Verify user roles for admin operations
3. **Use secure cookies**: Configure secure cookie settings
4. **Handle errors**: Always handle authentication errors gracefully
5. **Use HTTPS**: Always use HTTPS in production
6. **Session expiration**: Set appropriate session expiration times
7. **Rate limiting**: Implement rate limiting for login attempts

## References

- [Auth.js Documentation](https://authjs.dev)
- [Auth.js Security Best Practices](https://authjs.dev/getting-started/security)
- Project documentation: `docs/security/authentication.md`, `docs/security/README.md`, `docs/guides/coding-standards.md`
