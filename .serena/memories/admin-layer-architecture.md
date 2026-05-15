# Admin Layer Architecture (Validations → Actions → Queries)

## Three-Layer Pattern Overview

The admin panel uses a strict separation between:
1. **Validations** (`_shared/lib/validations/`) — Zod schemas for form/API input
2. **Actions** (`_shared/actions/`) — "use server" Server Actions with `executeAdminMutationResult` pattern
3. **Queries** (`_shared/queries/`) — Permission-checked read operations

**File Count Summary**:
- Validations: 11 files (27–302 lines each, mostly domain-specific schemas)
- Actions: 45 files (single flat files or index+mutations split)
- Queries: 26 files (thin wrappers around domain query layer)

---

## 1. Validations Layer (`_shared/lib/validations/`)

**Purpose**: Define Zod schemas for form inputs and API requests. Schemas include:
- Input validation (type coercion + constraint checks)
- Transformation (e.g., JSON string → parsed object)
- Default values for form initialization

**Key Files**:
- `api-keys.ts` — External API key format validation (Resend, Turnstile, Google Maps, Cloudflare)
- `faq.ts` — FaqCategory + FaqItem schemas (includes SEO/OGP merge)
- `news.ts` — News slug + create/update schemas (Lexical JSON validation)
- `space.ts` — Space form schema with complex discount/tax fields (250 lines)

**Pattern Example** (`faq.ts`):
```typescript
export const faqCategoryFormSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).nullable().optional(),
  order: z.number().int().min(0),
  isActive: z.boolean(),
});

export type FaqCategoryFormInput = z.infer<typeof faqCategoryFormSchema>;

export const defaultFaqCategoryFormValues: FaqCategoryFormInput = {
  name: "",
  slug: "",
  // ...
};
```

**Merging SEO/OGP**: Some schemas (news, space) merge `seoOgpFieldsSchema` to include meta fields:
```typescript
export const updateNewsSchema = z
  .object({ slug, title, contentJson, contentWidth })
  .merge(seoOgpFieldsSchema);  // ← Adds metaDescription, ogpTitle, etc.
```

**Server Action Imports**:
- Actions import schemas from `@/shared/lib/validations/` (not domain-specific)
- Admin-only extensions (e.g., customer status enum) defined in `@/shared/lib/validations/enums`

---

## 2. Actions Layer (`_shared/actions/`)

**Purpose**: Server Actions that perform mutations with:
- Input validation (safeParse)
- Permission checking + audit logging (via `executeAdminMutationResult`)
- Domain command execution
- Cache invalidation (`updateTag`)

### Structure Patterns

**Pattern A: Single File** (coupon.ts, customer.ts, faq.ts)
- 4 basic CRUD functions: create, update, delete, toggle-active
- All in one `.ts` file (90–165 lines)

**Pattern B: Modular (index + mutations)** (post, reservation, terms, api-keys)
- `index.ts` — barrel exports
- `mutations.ts` — actual Server Action functions
- Used when action file exceeds ~500 lines (per `.claude/rules/`)

### Validation → Execution → Cache Pattern

**Every Server Action follows this flow** (coupon.ts example):

```typescript
"use server";

import { updateTag } from "next/cache";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";

export async function createCoupon(
  input: CouponFormInput,
): Promise<MutationResult<{ id: string }>> {
  // Step 1: Validate input
  const parsed = couponFormSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  // Step 2: Execute with auth + audit logging
  return executeAdminMutationResult({
    resource: "coupon",
    action: "create",
    execute: async () => createCouponCommand(parsed.data),
    afterSuccess: () => {
      // Step 3: Invalidate caches
      updateTag(CACHE_TAGS.COUPONS);
    },
    resolveAuditResourceId: (result) => result.id,
  });
}
```

### executeAdminMutationResult API

**Options**:
- `resource: Resource` — Target entity (coupon, customer, space, etc.)
- `action: Action` — CRUD verb (create, update, delete, read)
- `resourceId?: string` — For update/delete, pass the entity ID (optional for create)
- `checkResourceAccess?: boolean` — Row-level access check (default: false)
- `execute: (user: User) => Promise<TData>` — Domain command function (receives authenticated user)
- `afterSuccess?: (data: TData) => void | Promise<void>` — Cache invalidation callback
- `resolveAuditResourceId?: (data: TData) => string | undefined` — Extract audit ID from result

**Return**: `MutationResult<TData>` — Either data or `{ error: string }`

**Error Handling**:
- `isDomainError(error)` — Catches business logic exceptions, returns `{ error: message }`
- Other exceptions rethrown (unhandled errors bubble to error boundary)

### Common Pattern Variations

**Toggle Switch** (toggleCouponActive):
```typescript
export async function toggleCouponActive(
  id: string,
): Promise<MutationResult<{ isActive: boolean }>> {
  return executeAdminMutationResult({
    resource: "coupon",
    action: "update",
    resourceId: id,
    execute: async () => toggleCouponActiveCommand(id),
    // No afterSuccess needed if domain command invalidates cache
  });
}
```

**Status Update** (customer.ts — updateCustomerStatus):
```typescript
export async function updateCustomerStatus(
  id: string,
  status: CustomerStatus,
): Promise<MutationResult> {
  const parsed = updateCustomerStatusSchema.safeParse({ id, status });
  // ...
  return executeAdminMutationResult({
    resource: "customer",
    action: "update",
    resourceId: parsed.data.id,
    execute: async () => {
      await updateCustomerStatusCommand(parsed.data.id, parsed.data.status);
      return null;  // ← void returns null
    },
  });
}
```

**Micro Schemas**: Small-field updates use dedicated schemas (`updateCustomerStatusSchema`, `updateCustomerNotesSchema`)

### Cache Invalidation Pattern

**Single Tag**:
```typescript
afterSuccess: () => {
  updateTag(CACHE_TAGS.COUPONS);
}
```

**Multiple Tags** (detail + list):
```typescript
afterSuccess: () => {
  updateTag(CACHE_TAGS.COUPONS);
  updateTag(getCacheTag.coupons.detail(id));
}
```

**getCacheTag** utility: `getCacheTag.{resource}.{scope}(id?)` builds scoped cache keys

---

## 3. Queries Layer (`_shared/queries/`)

**Purpose**: Permission-checked wrappers around domain queries. Thin layer:
1. Calls `requireAdminPermission(resource, "read")`
2. Delegates to domain query function
3. Returns typed result

**Example** (coupon.ts):
```typescript
import "server-only";
import { getCouponById as getCouponByIdQuery } from "@/shared/domain/coupons/queries";

export async function getCoupons(
  filters: CouponFilters = {},
  pagination: CouponPagination = {},
): Promise<GetCouponsResult> {
  await requireAdminPermission("coupon", "read");
  return getCouponsQuery(filters, pagination);
}

export async function getCouponById(id: string): Promise<CouponDetailData | null> {
  await requireAdminPermission("coupon", "read");
  const validated = idSchema.safeParse(id);
  if (!validated.success) return null;
  return getCouponByIdQuery(validated.data);
}
```

**Pattern**:
- Each resource gets a query file (coupon.ts, customer.ts, space.ts, etc.)
- Functions wrap domain queries with permission checks
- Always validate ID input with Zod (quick UUID check)
- Return null on invalid ID (defensive programming)

**Difference from Actions**:
- Queries use `requireAdminPermission` (direct check)
- Actions use `executeAdminMutationResult` (wraps permission + audit + error handling)

### _helpers.ts Pattern

**File**: `queries/_helpers.ts`

Contains shared utilities:
- `requireAdminPermission(resource, action)` — Throws if unauthorized
- `requireAdminSession()` — Retrieves authenticated user

Used by all query files.

---

## Key Dependencies

**Imports in Actions**:
```typescript
import { updateTag } from "next/cache";                              // Cache invalidation
import { executeAdminMutationResult } from "@/admin/lib/admin-action";  // Auth wrapper
import { createValidationMutationError } from "@/shared/lib/action-helpers";  // Error helper
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";   // Cache key constants
import { createXxxCommand } from "@/shared/domain/xxx/commands";    // Domain layer
import { xxxFormSchema } from "@/shared/lib/validations/xxx";       // Validation schema
```

**Imports in Queries**:
```typescript
import "server-only";
import { getXxxQuery } from "@/shared/domain/xxx/queries";  // Domain queries
import { requireAdminPermission } from "./_helpers";        // Permission check
```

---

## Separation of Concerns

| Layer       | Location                   | Responsibility                                  |
|-------------|----------------------------|------------------------------------------------|
| Validation  | `lib/validations/`         | Schema definition + default values + transformation |
| Action      | `actions/`                 | Auth + validation + domain call + cache + audit |
| Query       | `queries/`                 | Auth + permission check + domain delegation    |
| Domain      | `@/shared/domain/xxx/`     | Business logic (commands, queries, types)      |

**No crossover**:
- Validations don't import actions/queries
- Actions import validations only
- Queries don't import actions
- All layers delegate data access to domain

---

## Type Flow

**Form Input → Validation → Action Execution → Cache**:

```typescript
// Component submits form data (unknown type)
const formData = { name: "foo", slug: "bar" };

// Action validates
const parsed = faqCategoryFormSchema.safeParse(formData);
// parsed.data is now FaqCategoryFormInput (type-safe)

// Domain command receives typed input
await createFaqCategoryCommand(parsed.data);

// Returns domain entity (Serialized<FaqCategory>)
// Action wraps in MutationResult<T>
return { id, name, slug, ... };

// Client receives type-safe response
if (result.error) { ... } else { const id = result.id; }
```

**Query Type Flow**:

```typescript
// Server Component calls query
const result = await getCoupons(filters, pagination);

// Query returns typed result (GetCouponsResult)
// Includes pagination metadata + serialized entities
return result;  // { coupons: [...], total, page, totalPages }
```

---

## Caching Strategy

**Cache Tags** (from `CACHE_TAGS` constant):
- `COUPONS` — All coupons list
- `CUSTOMERS` — All customers list
- `getCacheTag.coupons.detail(id)` — Single coupon details
- `getCacheTag.customers.detail(id)` — Single customer details

**Invalidation Timing**:
- Create: Invalidate list tag only (new item appears in next fetch)
- Update: Invalidate both list + detail tag (prevents stale detail view)
- Delete: Invalidate list tag only (detail not fetched after redirect)

**Pattern**: Always call `updateTag()` in `afterSuccess` callback within `executeAdminMutationResult`

---

## Notes

- **No `try/catch` in validation layer** — Zod errors are structured (no exceptions)
- **`executeAdminMutationResult` handles domain exceptions** — Distinguishes DomainError (business logic) from unexpected errors
- **ID validation is defensive** — Even though IDs come from authenticated actions, Zod validates before passing to domain
- **Server Actions are "use server" only** — All 45 action files start with `"use server"`
- **Queries use "server-only" import** — Not executable by client; compile error if imported from Client Component
- **No circular imports** — Queries never import Actions; Actions never export to Queries
