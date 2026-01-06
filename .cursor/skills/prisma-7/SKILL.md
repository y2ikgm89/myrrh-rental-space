---
name: prisma-7
description: Provides guidance for using Prisma 7 ORM effectively, including query optimization, transactions, and best practices. Use when writing database queries with Prisma, optimizing database queries, working with relationships and includes, implementing transactions, handling pagination, or working with indexes.
compatibility: Designed for Cursor (or similar AI coding assistants). Requires Prisma 7 or later.
metadata:
  author: myrrh-rental-space
  version: "1.0.0"
  orm: "Prisma 7"
---

# Prisma 7

This skill provides guidance for using Prisma 7 ORM effectively, including query optimization, transactions, and best practices.

## When to use this skill

Use this skill when:
- Writing database queries with Prisma
- Optimizing database queries
- Working with relationships and includes
- Implementing transactions
- Handling pagination
- Working with indexes

## Examples

**Example 1**: "Fetch spaces with their reservations"
- This skill will guide you to use `include` to avoid N+1 queries, select only needed fields, and structure the query efficiently.

**Example 2**: "Create a space and its initial reservation in a transaction"
- This skill will guide you to use `$transaction` for atomic operations, handle errors properly, and ensure data consistency.

**Example 3**: "Add pagination to the reservations list"
- This skill will guide you to use `skip` and `take`, fetch count in parallel with `Promise.all`, and calculate total pages correctly.

## Instructions

### Query Optimization

- **Use `select`**: Always select only the fields you need
- **Use `include`**: Use `include` to avoid N+1 query problems
- **Use `in` filter**: Use `in` filter when `include` is not applicable

```typescript
// ✅ Good: Select only needed fields
const spaces = await prisma.space.findMany({
  select: {
    id: true,
    name: true,
    mainImageUrl: true,
    hourlyPrice: true,
  },
})

// ✅ Good: Use include to avoid N+1 problems
const reservations = await prisma.reservation.findMany({
  include: {
    space: {
      select: {
        id: true,
        name: true,
        mainImageUrl: true,
      },
    },
    user: {
      select: {
        id: true,
        name: true,
        email: true,
      },
    },
  },
})

// ✅ Good: Use in filter to avoid N+1 problems
const users = await prisma.user.findMany({})
const userIds = users.map((x) => x.id)

const posts = await prisma.post.findMany({
  where: {
    authorId: {
      in: userIds,
    },
  },
})
```

### Transactions

- **Use `$transaction`**: For multiple related operations that must succeed or fail together
- **Use async transactions**: For better error handling and readability

```typescript
// ✅ Good: Transaction for related operations
await prisma.$transaction(async (tx) => {
  const space = await tx.space.create({
    data: spaceData,
  })

  await tx.reservation.create({
    data: {
      spaceId: space.id,
      // ...
    },
  })

  return space
})
```

### Pagination

- **Use `skip` and `take`**: For efficient pagination
- **Use `Promise.all`**: For parallel queries (data and count)

```typescript
// ✅ Good: Efficient pagination
const page = 1
const pageSize = 12

const [spaces, total] = await Promise.all([
  prisma.space.findMany({
    where: { isPublished: true },
    skip: (page - 1) * pageSize,
    take: pageSize,
    orderBy: { createdAt: 'desc' },
  }),
  prisma.space.count({
    where: { isPublished: true },
  }),
])

const totalPages = Math.ceil(total / pageSize)
```

### Indexes

- **Add indexes**: For frequently queried fields
- **Use composite indexes**: For queries that filter by multiple fields
- **Define indexes in schema**: Use `@@index` in Prisma schema

```prisma
// ✅ Good: Composite index for common queries
model Reservation {
  id        String   @id @default(uuid())
  spaceId   String
  startTime DateTime
  endTime   DateTime
  status    String

  @@index([spaceId, startTime, endTime]) // Composite index
  @@index([status, startTime])
}
```

### Parallel Data Fetching

- **Use `Promise.all`**: For parallel queries that don't depend on each other

```typescript
// ✅ Good: Parallel data fetching
export default async function DashboardPage() {
  const [spaces, reservations, users] = await Promise.all([
    prisma.space.count(),
    prisma.reservation.count(),
    prisma.user.count(),
  })

  return (
    <div>
      <Stats spaces={spaces} reservations={reservations} users={users} />
    </div>
  )
}
```

### Error Handling

- **Handle Prisma errors**: Check for specific error codes
- **Use try-catch**: For error handling in database operations

```typescript
// ✅ Good: Prisma error handling
import { Prisma } from '@prisma/client'

try {
  const space = await prisma.space.create({ data })
  return { success: true, spaceId: space.id }
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return {
        success: false,
        error: 'Duplicate entry',
      }
    }
  }

  console.error('Unexpected error:', error)
  return {
    success: false,
    error: 'An unexpected error occurred',
  }
}
```

### Prisma Client Singleton

- **Use singleton pattern**: Import Prisma Client from `@/lib/prisma`
- **Don't create multiple instances**: Always use the singleton instance

```typescript
// ✅ Good: Use singleton Prisma Client
import { prisma } from '@/lib/prisma'

export async function getSpaces() {
  return await prisma.space.findMany({
    where: { isPublished: true },
  })
}
```

## Best Practices

1. **Select only needed fields**: Use `select` to reduce data transfer
2. **Avoid N+1 queries**: Use `include` or `in` filter
3. **Use transactions**: For related operations that must succeed or fail together
4. **Add indexes**: For frequently queried fields
5. **Use parallel queries**: Use `Promise.all` for independent queries
6. **Handle errors**: Always handle Prisma-specific errors
7. **Use singleton**: Always use the Prisma Client singleton from `@/lib/prisma`

## References

- [Prisma Documentation](https://www.prisma.io/docs)
- [Prisma Best Practices](https://www.prisma.io/docs/guides/performance-and-optimization)
- Project documentation: `docs/DATABASE_DESIGN.md`, `docs/BEST_PRACTICES.md`
