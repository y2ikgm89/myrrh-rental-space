# Admin Shared Infrastructure Analysis

## Directory Structure

```
src/app/(admin)/admin/(dashboard)/_shared/
├── components/
│   ├── [Core Layout Components]
│   │   ├── AdminDetailLayout.tsx          — Detail page header (back button, title, actions)
│   │   ├── DetailField.tsx                — Read-only field display (label + value)
│   │   ├── DetailSection.tsx              — Grouped detail section
│   │   ├── ActionDropdown.tsx             — Table row action menu (3-dot dropdown)
│   │   ├── DeleteConfirmDialog.tsx        — Unified delete confirmation dialog
│   ├── [UI Dialogs & Alerts]
│   │   ├── ui/dialog.tsx
│   │   ├── ui/alert-dialog.tsx
│   │   ├── ui/button.tsx
│   │   ├── ui/PublishSwitch.tsx           — Toggle publish status with isPending state
│   ├── [Status & Lists]
│   │   ├── status-badges.tsx
│   │   ├── EmptyState.tsx
│   │   ├── LoadingState.tsx
│   │   ├── SortableTableHead.tsx
│   ├── [Form Components]
│   │   ├── ListPageSeoForm.tsx
│   ├── [Editor & Specialized]
│   │   ├── editor/                       — Lexical WYSIWYG editor (100+ files)
│   │   ├── media-picker/                 — Media picker component
│   │   ├── cta-button-editor/            — CTA button builder
│   │   ├── seo/                          — SEO-specific components
│   ├── [Security & Cleanup]
│   │   ├── SanitizedHtml.tsx             — DOMPurify-wrapped HTML renderer
│   │   ├── DangerZone.tsx                — Destructive action section
│   │
├── actions/                               — Server Actions (Zod + MutationResult pattern)
│   ├── [Organized by Domain]
│   │   ├── space.ts                       — Space CRUD (create/update/delete/publish)
│   │   ├── post/
│   │   │   ├── index.ts                   — Barrel export
│   │   │   └── mutations.ts               — Post mutations (create/update/delete)
│   │   ├── reservation/
│   │   │   ├── index.ts
│   │   │   ├── mutations.ts
│   │   │   └── admin.ts                   — Admin-only reservation actions
│   │   ├── settings/                      — Settings singleton (9 sub-actions)
│   │   │   ├── index.ts                   — Barrel export (all schema types + action exports)
│   │   │   ├── schemas.ts                 — Zod validation schemas (all input types)
│   │   │   ├── types.ts                   — Business types (BusinessHours, SettingsData)
│   │   │   ├── basic.ts                   — Basic info, layout, SEO
│   │   │   ├── business.ts                — Business hours, contact, MEO
│   │   │   ├── email.ts                   — Email & notification settings
│   │   │   ├── google-calendar.ts         — Google Calendar OAuth + 2-way sync
│   │   │   ├── stripe.ts                  — Stripe payment keys
│   │   │   ├── discount.ts                — Duration-based discounts
│   │   │   ├── tax.ts                     — Tax settings
│   │   │   ├── other.ts                   — Maintenance, cookie consent, sidebar, footer
│   │   │   ├── robots-txt.ts              — robots.txt generation
│   │   │   └── robots-txt-constants.ts    — Default robots.txt template
│   │   ├── terms/
│   │   │   ├── index.ts
│   │   │   └── mutations.ts
│   │   ├── api-keys/
│   │   │   ├── index.ts
│   │   │   └── mutations.ts
│   │   ├── [Single-file Actions]
│   │   │   ├── media.ts                   — File upload (FormData)
│   │   │   ├── faq.ts
│   │   │   ├── news.ts
│   │   │   ├── page.ts
│   │   │   ├── user.ts
│   │   │   ├── customer.ts
│   │   │   ├── location.ts
│   │   │   ├── space-category.ts
│   │   │   ├── coupon.ts
│   │   │   ├── announcement-bar.ts
│   │   │   ├── navigation.ts
│   │   │   ├── page-section.ts
│   │   │   ├── block-template.ts
│   │   │   ├── ical-tokens.ts
│   │   │   ├── instagram.ts
│   │   │   ├── staff-invitation.ts
│   │   │   ├── homepage-settings.ts
│   │   │   ├── fetch-ogp.ts
│   │   │   ├── inquiry.ts
│   │   │   ├── editor-comment.ts
│   │   │   └── post-comment.ts
│   │
├── queries/                               — Server-only query functions ('use cache')
│   ├── dashboard.ts                       — Dashboard statistics
│   ├── space.ts
│   ├── location.ts
│   ├── spaceCategory.ts
│   ├── post.ts
│   ├── news.ts
│   ├── page.ts
│   ├── faq.ts
│   ├── user.ts
│   ├── customer.ts
│   ├── reservation.ts
│   ├── inquiry.ts
│   ├── audit-log.ts
│   ├── instagram.ts
│   ├── api-keys.ts
│   ├── post-comment.ts
│   ├── staff-invitation.ts
│   └── _helpers.ts                        — Query auth helpers (require*Permission functions)
│
├── hooks/                                 — Client hooks
│   ├── useFormAction.ts                   — Form submission hook (react-hook-form + Zod 4 + useTransition)
│   ├── use-media-upload.ts                — File upload with validation
│   ├── use-media-library.ts               — Media library state
│   ├── use-media-selection.ts             — Multi-select media
│   ├── use-media-picker.tsx               — Full media picker UI
│   ├── use-filter-params.ts               — URL search param filters
│   ├── use-kana-input.ts                  — Japanese kana conversion
│   ├── use-preview.ts                     — Preview data persistence
│   └── index.ts                           — Barrel export
│
├── lib/                                   — Server + shared utilities
│   ├── [Auth & Permissions]
│   │   ├── action-auth.ts                 — checkAdminAuth, checkPermission, checkRole
│   │   ├── admin-action.ts                — executeAdminMutationResult<TData> wrapper
│   │   ├── permissions.ts                 — ROLE_PERMISSIONS matrix, hasPermission()
│   │   ├── role-guards.ts                 — isEditorRole(), isAdminRole()
│   │   └── audit.ts                       — logUserAction() for audit trail
│   ├── [External APIs]
│   │   ├── api-keys/
│   │   │   ├── index.ts                   — Centralized API key validation
│   │   │   ├── cloudflare.ts
│   │   │   ├── google-maps.ts
│   │   │   ├── resend.ts
│   │   │   ├── turnstile.ts
│   │   │   └── helpers.ts
│   │   ├── stripe.ts                      — Stripe client initialization
│   │   ├── stripe-shared.ts               — Shared Stripe utilities
│   │   ├── instagram.ts                   — Instagram API
│   │   └── admin-api-client.ts            — Custom API client
│   ├── [Specialized]
│   │   ├── calendar/
│   │   │   ├── calendar-types.ts          — Calendar domain types
│   │   │   ├── calendar-domain.ts         — Calendar logic
│   │   │   └── index.ts
│   │   ├── ical.ts                        — iCal generation
│   │   ├── lazy-renderer.ts               — Lexical → HTML lazy rendering
│   │   └── validations/                   — Zod schemas (per-domain)
│   │       ├── space.ts
│   │       ├── post.ts
│   │       ├── news.ts
│   │       ├── faq.ts
│   │       ├── admin-reservation.ts
│   │       ├── api-keys.ts
│   │       ├── auth.ts
│   │       ├── media.ts
│   │       ├── stripe.ts
│   │       ├── homepage-section.ts
│   │       ├── instagram.ts
│   │       └── [others]
│   ├── [UI Utilities]
│   │   ├── styles/
│   │   │   └── z-index.ts                 — Centralized z-index scale
│   │   └── utils.ts
│   └── [Cached Queries]
│       └── _helpers.ts                    — requireAdminDashboardAccess(), requireAdminPermission()
│
├── types/                                 — Admin-specific type definitions
│   ├── admin-layout.ts
│   ├── api-keys.ts
│   ├── media-picker.ts
│   ├── editor-comment.ts
│   └── server-actions.ts                  — Server Action return types
│
└── contexts/                              — React contexts
    └── [icon]index.ts
```

---

## Key Patterns & Conventions

### 1. **Server Actions Pattern**

**Location**: `_shared/actions/*.ts`

**Structure**:
```ts
"use server"

import { executeAdminMutationResult } from "@/admin/lib/admin-action"
import { spaceFormSchema } from "@/admin/lib/validations/space"

export async function updateSpace(
  id: string,
  input: SpaceFormData
): Promise<MutationResult> {
  const parsed = spaceFormSchema.safeParse(input)
  if (!parsed.success) {
    return createValidationMutationError(parsed.error)
  }

  return executeAdminMutationResult({
    resource: "space",
    action: "update",
    resourceId: id,
    execute: async () => {
      await updateSpaceCommand(id, parsed.data)
      return null
    },
    afterSuccess: () => {
      revalidateSpaces(id)
    },
  })
}
```

**Key Points**:
- Always use `executeAdminMutationResult()` wrapper (handles auth + audit)
- Zod validation **before** executeAdminMutationResult
- Return `MutationResult<T>` (not throwing exceptions)
- Use `updateTag()` for cache invalidation (Next.js 16)
- Domain commands live in `@/shared/domain/`, not actions

### 2. **Form Submission Hook Pattern**

**Location**: `_shared/hooks/useFormAction.ts`

```ts
const { form, isPending, onSubmit } = useFormAction(
  categorySchema,
  createCategory,
  {
    defaultValues: existingData,
    successMessage: "保存しました",
    redirectTo: "/admin/categories",
  }
)

// In JSX:
<form onSubmit={onSubmit}>
  <FormField control={form.control} ... />
  <SubmitButton isPending={isPending} label="保存" />
</form>
```

**Features**:
- Uses **Zod 4** + `standardSchemaResolver` (Standard Schema support)
- Integrates `useTransition()` for server-side pending state
- Auto-sets field errors from server response
- Toast notifications (success/error)
- Redirect or refresh on success
- `onSuccess` callback with typed data

### 3. **Permissions & RBAC**

**Location**: `_shared/lib/permissions.ts`

**Roles**:
- `SUPER_ADMIN`: All permissions
- `ADMIN`: Content management (no user/audit log)
- `EDITOR`: Assigned pages only (requires `userHasResourceAccess()`)
- `VIEWER`: Read-only
- `USER`: Public user (no admin access)

**Check Pattern**:
```ts
// In Server Actions:
const auth = await checkPermission("space", "create")
if (!auth.success) return auth.error

// In Server Components (queries):
const user = await requireAdminPermission("space", "read")

// For EDITOR resource filtering:
const accessible = await userHasResourceAccess(user, "page", "update", pageId)
```

**Audit Logging**:
- Automatically logged in `executeAdminMutationResult()`
- Resolves to DB `AuditLog` table
- Resource ID optionally tracked

### 4. **Query Organization**

**Location**: `_shared/queries/*.ts`

**Pattern**:
```ts
import "server-only"
import { requireAdminPermission } from "@/admin/queries/_helpers"
import { getCacheTag } from "@/shared/lib/constants"

export async function getSpaces(
  page = 1,
  limit = 10
) {
  const user = await requireAdminPermission("space", "read")

  // Queries use "use cache" directive in Next.js 16
  const spaces = await db.space.findMany({
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { createdAt: "desc" },
  })

  return spaces
}
```

**Auth Helpers** (`_helpers.ts`):
- `requireAdminDashboardAccess()` — General admin access
- `requireAdminPermission(resource, action)` — Specific permission
- `requireAdminResourcePermission(resource, action, id)` — EDITOR filtering

### 5. **Validation Strategy**

**Location**: `_shared/lib/validations/*.ts`

**Structure**:
```ts
export const spaceFormSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().nullable(),
  hourlyPrice: z.number().positive(),
  // ...
})

export type SpaceFormData = z.infer<typeof spaceFormSchema>
```

**Usage in Actions**:
```ts
const parsed = spaceFormSchema.safeParse(input)
if (!parsed.success) {
  return createValidationMutationError(parsed.error) // Auto-converts to fieldErrors
}
```

### 6. **UI Component Conventions**

**Detail Pages** (`AdminDetailLayout`):
```tsx
<AdminDetailLayout
  backHref="/admin/spaces"
  title="スペース編集"
  actions={<DeleteButton />}
>
  <form onSubmit={onSubmit}>
    {/* form fields */}
  </form>
</AdminDetailLayout>
```

**Tables** (`ActionDropdown`):
```tsx
<ActionDropdown disabled={isDeleting}>
  <ActionDropdownItem href={`/admin/spaces/${id}/edit`}>
    編集
  </ActionDropdownItem>
  <ActionDropdownItem href={`/admin/spaces/${id}`}>
    詳細
  </ActionDropdownItem>
  <ActionDropdownSeparator />
  <ActionDropdownItem
    destructive
    onClick={() => setDeleteOpen(true)}
  >
    削除
  </ActionDropdownItem>
</ActionDropdown>
```

**Delete Dialogs**:
```tsx
<DeleteConfirmDialog
  open={open}
  onOpenChange={setOpen}
  itemName="Space A"
  onConfirm={handleDelete}
  isPending={isDeleting}
/>
```

**Publish Toggle** (`PublishSwitch`):
```tsx
const { isPending, onToggle } = useFormAction(...)
<PublishSwitch
  checked={isPublished}
  onToggle={(checked) => onToggle("id", checked)}
  isPending={isPending}
/>
```

### 7. **Media Upload Hook**

**Location**: `_shared/hooks/use-media-upload.ts`

```ts
const { uploadFile, isUploading, previewUrl, setPreviewFile } = useMediaUpload()

// Preview local file before upload:
setPreviewFile(file)

// Upload when ready:
const result = await uploadFile(file, metadata, "hero-image")
if (result) {
  // Handle result.id, result.url
}
```

### 8. **Settings Singleton Pattern**

**Location**: `_shared/actions/settings/`

**4-Part Update Process**:
1. `schema.prisma` — Add field + migrate
2. `actions/settings/types.ts` — Add to `SettingsData` type
3. `actions/settings/schemas.ts` — Add Zod schema
4. `actions/settings/{basic|business|email|other}.ts` — Add Server Action

**Usage**:
```ts
const { form, isPending, onSubmit } = useFormAction(
  updateBasicInfoSchema,
  updateBasicInfo,
  { refresh: true }
)
```

---

## Extension Points & Reusable Patterns

### **For New Admin Features**:
1. **Query** → `_shared/queries/[resource].ts` (with `requireAdminPermission`)
2. **Validation** → `_shared/lib/validations/[resource].ts` (Zod schema)
3. **Server Action** → `_shared/actions/[resource].ts` (using `executeAdminMutationResult`)
4. **Form Hook** → Component uses `useFormAction(schema, action)`
5. **UI Components** → Leverage `AdminDetailLayout`, `ActionDropdown`, `DeleteConfirmDialog`

### **For Settings Fields**:
Update 4 locations: prisma schema, types, schemas, action handler

### **For Multi-Part Actions** (e.g., large post/reservation):
- Organize into subdirectories: `actions/post/{index, mutations}.ts`
- Use barrel export pattern in `index.ts`

### **For Media Handling**:
- Use `useMediaUpload()` for client-side
- FormData via `uploadMedia()` action
- Validation in `lib/validations/media.ts`

---

## API & External Services

| Service | Pattern | Location |
|---------|---------|----------|
| **Stripe** | SDK v20, `2026-02-25.clover` API | `lib/stripe.ts` |
| **Google Maps** | API key centralization | `lib/api-keys/google-maps.ts` |
| **Resend** | Email templating | `lib/api-keys/resend.ts` |
| **Google Calendar** | OAuth 2-way sync | `actions/settings/google-calendar.ts` |
| **Instagram** | Graph API | `actions/instagram.ts` |
| **Cloudflare** | Cache purging | `@/shared/lib/cloudflare` |

---

## File Size Management

- **action-auth.ts**: <200 lines (per-action decision, no HOF)
- **permissions.ts**: <400 lines (ROLE_PERMISSIONS matrix)
- **space.ts**: <100 lines (example single-domain action file)
- **settings/**: Split across 8+ files to avoid 500+ line actions

Split candidates: `settings/index.ts` if exceeds 500 lines (use `split-action-file` skill).
