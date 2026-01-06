---
name: bun-runtime
description: Provides guidance for working with Bun 1.3.5 runtime, including development, build, testing, and deployment. Use when running development server, building the application, running tests, managing dependencies, deploying to production, or working with Bun-specific features.
compatibility: Designed for Cursor (or similar AI coding assistants). Requires Bun 1.3.5 or later.
metadata:
  author: myrrh-rental-space
  version: "1.0.0"
  runtime: "Bun 1.3.5"
---

# Bun Runtime

This skill provides guidance for working with Bun 1.3.5 runtime, including development, build, testing, and deployment.

## When to use this skill

Use this skill when:
- Running development server
- Building the application
- Running tests
- Managing dependencies
- Deploying to production
- Working with Bun-specific features

## Examples

**Example 1**: "Start the development server"
- This skill will guide you to use `bun run dev`, which starts the Next.js development server with Turbopack on Bun runtime.

**Example 2**: "Check for outdated packages"
- This skill will guide you to use `bun outdated` to see current/wanted/latest versions, then use `bun info <package>` for specific package information.

**Example 3**: "Run Prisma migrations"
- This skill will guide you to use `bunx prisma migrate dev` for creating migrations and `bunx prisma migrate deploy` for production deployments.

## Instructions

### Development Commands

- **Use `bun run dev`**: For starting development server
- **Use `bun run build`**: For building the application
- **Use `bun run start`**: For starting production server
- **Use `bun run lint`**: For linting
- **Use `bun run type-check`**: For type checking

```bash
# Development
bun run dev          # Start dev server (http://localhost:3000)
bun run build        # Build for production
bun run start        # Start production server
bun run lint         # Run linter
bun run type-check   # Run TypeScript type checker
```

### Dependency Management

- **Use `bun install`**: For installing dependencies
- **Use `bun outdated`**: For checking outdated packages
- **Use `bun info <package>`**: For package information
- **Use `bun add <package>@latest --dry-run`**: For checking upgrade impact
- **Use `bunx npm-check-updates`**: For major version updates

```bash
# Install dependencies
bun install

# Check outdated packages
bun outdated

# Get package info
bun info next version

# Check upgrade impact
bun add next@latest --dry-run

# Major version updates
bunx npm-check-updates
```

### Testing with Bun

- **Use `bun run test`**: For running tests
- **Use `bun run test:watch`**: For watch mode
- **Use `bun run test:coverage`**: For coverage report
- **Use `bun run test:e2e`**: For E2E tests (Playwright)

```bash
# Run tests
bun run test              # Run all tests
bun run test:watch         # Watch mode
bun run test:coverage      # Coverage report
bun run test:e2e           # E2E tests
bun run test:e2e:ui        # E2E tests with UI
```

### Prisma with Bun

- **Use `bunx prisma migrate dev`**: For creating migrations
- **Use `bunx prisma migrate deploy`**: For deploying migrations
- **Use `bunx prisma studio`**: For viewing database
- **Use `bunx prisma generate`**: For generating Prisma Client

```bash
# Prisma commands
bunx prisma migrate dev --name <migration_name>
bunx prisma migrate deploy
bunx prisma studio
bunx prisma generate
```

### Runtime Compatibility

- **Node.js compatibility**: Bun has Node.js compatibility, so Prisma works perfectly
- **No Edge Runtime**: Prisma does not support Edge Runtime, use Bun Runtime (Node.js compatible)
- **Explicit runtime**: Specify `runtime = "nodejs"` in API Routes and Server Actions

```typescript
// ✅ Good: Explicit runtime specification
// src/app/api/spaces/route.ts
export const runtime = 'nodejs' // Bun has Node.js compatibility

export async function GET() {
  // Prisma works perfectly with Bun runtime
  const spaces = await prisma.space.findMany()
  return Response.json({ spaces })
}
```

### Production Deployment

- **Use Docker**: Deploy as Docker container with Bun runtime
- **Use `oven/bun:1.3.5`**: Base image for Docker
- **Use `bun install --frozen-lockfile`**: In CI/CD for reproducible builds

```dockerfile
# ✅ Good: Dockerfile with Bun runtime
FROM oven/bun:1.3.5 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Build application
COPY . .
RUN bun run build

# Production image
FROM oven/bun:1.3.5 AS runner
WORKDIR /app
COPY --from=base /app ./
CMD ["bun", "run", "start"]
```

### Environment Variables

- **Use `.env.local`**: For development (never commit)
- **Use Google Secret Manager**: For production
- **Validate on startup**: Validate all required environment variables

```typescript
// ✅ Good: Environment variable validation
// src/lib/env.ts
import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(1),
  NEXTAUTH_URL: z.string().url(),
  // ...
})

export const env = envSchema.parse(process.env)
```

## Best Practices

1. **Use Bun commands**: Always use `bun` instead of `npm` or `yarn`
2. **Frozen lockfile**: Use `--frozen-lockfile` in CI/CD
3. **Runtime specification**: Explicitly specify runtime for API Routes
4. **Environment validation**: Always validate environment variables on startup
5. **Docker deployment**: Use Bun base image for Docker containers
6. **Test with Bun**: Use Bun test runner for all tests

## References

- [Bun Documentation](https://bun.sh/docs)
- [Bun Runtime](https://bun.sh/docs/runtime)
- Project documentation: `docs/BUN_RUNTIME.md`, `docs/DEPLOYMENT.md`, `docs/DOCKER.md`
