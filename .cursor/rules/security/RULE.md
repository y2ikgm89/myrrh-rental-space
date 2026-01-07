---
description: "Security best practices for authentication, input validation, and data protection"
alwaysApply: true
---

# Security Best Practices

This rule enforces security standards across the project.

**Related Rules**: This rule is referenced by `@api-routes`, `@server-actions`, and `@components` for security patterns.

**Example Files**:
- `@src/lib/auth.ts` (authentication configuration)
- `@src/lib/turnstile.ts` (Turnstile verification utilities)
- `@src/lib/ratelimit.ts` (rate limiting utilities, if exists)

## Environment Variables

- **Development**: Use `.env.local` (never commit to Git)
- **Production**: Use Google Secret Manager
- **Validation**: Validate all required environment variables on application startup
- **No hardcoding**: Never hardcode sensitive information in source code

### Required Environment Variables

- `TURNSTILE_SITE_KEY`: Cloudflare Turnstile site key (public)
- `TURNSTILE_SECRET_KEY`: Cloudflare Turnstile secret key (confidential)
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`: Client-side site key (public)
- See `.env.example` for all required variables

## Input Validation

- **Zod schemas**: Validate all user inputs with Zod schemas (both client and server)
- **File uploads**: Implement file upload validation (size, format, malware scanning)
- **SQL injection**: Use Prisma ORM to prevent SQL injection attacks
- **Sanitization**: Sanitize user inputs before database operations

## Authentication & Authorization

- **Rate limiting**: Implement rate limiting for login attempts and form submissions
  - **Global rate limiting**: IP-based global rate limit for DDoS protection (100 requests per 15 minutes)
  - **Endpoint-specific limits**: Reservation form (5 per 15 min), Contact form (3 per 15 min), Login (5 per 15 min)
  - Use `@upstash/ratelimit` with Redis for distributed rate limiting
- **Session management**: Use secure session management (JWT with appropriate `maxAge`)
- **Secure cookies**: Configure secure cookies (`HttpOnly`, `Secure`, `SameSite`)
- **Route protection**: Protect API routes and Server Actions with authentication checks
- **RBAC**: Implement role-based access control (RBAC) in Middleware and Server Actions
- **Bot protection**: Integrate Cloudflare Turnstile for form submissions (reservation, contact, login forms)

## Security Headers

Configure security headers in `next.config.js`:

- **Content Security Policy (CSP)**: Strict directives (avoid `unsafe-eval` and `unsafe-inline` when possible)
  - **Cloudflare Turnstile**: Add `https://challenges.cloudflare.com` to `script-src`, `frame-src`, and `connect-src` directives
- **X-Frame-Options**: `DENY` (or `SAMEORIGIN` if iframes are needed)
- **X-Content-Type-Options**: `nosniff`
- **Permissions-Policy**: Disable unnecessary browser features
- **Referrer-Policy**: `strict-origin-when-cross-origin`
- **HTTPS**: Enable HTTPS for all communications (HSTS with `preload`)

## Database Security

- **RLS policies**: Configure Supabase Row Level Security (RLS) policies
- **Parameterized queries**: Use parameterized queries (Prisma ORM handles this)
- **Access controls**: Implement proper access controls at the database level
- **Security audits**: Regular security audits and dependency updates

## Caching Security

- **Never cache sensitive data**: User-specific data, session information, authentication tokens must not be cached
- **Use `unstable_noStore()`**: All data that depends on authentication state should use `unstable_noStore()`
- **Avoid sensitive cache keys**: Do not include user IDs, session tokens, or other sensitive data in cache keys or tags
- **Separate caches**: Public data and private data should use separate cache keys and tags
- **Invalidate on auth changes**: When user authentication state changes (login, logout, role change), invalidate related caches
- **Cache poisoning prevention**: Be careful with user input-based cache keys; validate and sanitize inputs

## Bot Protection

- **Cloudflare Turnstile**: Integrated for form submissions (reservation, contact, login forms)
  - Non-interactive CAPTCHA alternative (managed mode)
  - Server-side verification required
  - Integrated with rate limiting for multi-layer defense
- **Cloudflare Bot Fight Mode**: Already enabled (free plan)
  - Works alongside Turnstile for comprehensive bot protection

## Security Logging & Monitoring

- **Log security events**: Log all security-related events (authentication failures, authorization errors, invalid inputs, rate limit violations, Turnstile verification failures, IP blocks, spam detection)
- **Structured logging**: Use JSON format for logs
- **Never log sensitive data**: Do not log passwords, tokens, or other sensitive information
- **Monitor access patterns**: Track and alert on unusual access patterns

## Security Vulnerabilities

- **Critical**: React 19.0-19.2.0 and Next.js 15.x-16.0.6 have a critical security vulnerability (CVE-2025-55182)
- **Required**: Upgrade to React 19.2.3 and Next.js 16.1.1 immediately
  - This vulnerability allows unauthenticated remote code execution on the server
- **Server Components**: Apply React Server Components security patches
- **Regular audits**: Run `bun audit` regularly and apply security patches immediately

**Related Documentation**:
- [`docs/SECURITY.md`](../../docs/SECURITY.md) - Detailed security configuration
- [`docs/TURNSTILE_REQUIREMENTS.md`](../../docs/TURNSTILE_REQUIREMENTS.md) - Turnstile integration requirements
- [`docs/DDOS_PROTECTION_REQUIREMENTS.md`](../../docs/DDOS_PROTECTION_REQUIREMENTS.md) - DDoS protection requirements
- [`docs/ABUSE_PROTECTION_REQUIREMENTS.md`](../../docs/ABUSE_PROTECTION_REQUIREMENTS.md) - Abuse protection requirements
