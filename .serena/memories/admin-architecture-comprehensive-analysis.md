# Admin Panel Architecture Analysis (Comprehensive)

**Date**: 2026-03-13  
**Project**: Myrrh Rental Space  
**Scope**: `/src/app/(admin)/admin/` structure, patterns, consistency issues

---

## 1. ROUTE STRUCTURE OVERVIEW

### Root Layouts (Multiple Root Layouts)

```
src/app/(admin)/
├── admin/layout.tsx                    # Admin Root Layout (html/body)
├── admin/loading.tsx                   # Root loading state ✓
├── admin/(auth)/layout.tsx             # Auth route group
│   ├── login/page.tsx                  # Login form (Server Component)
│   ├── setup/[token]/page.tsx          # Onboarding form
│   └── loading.tsx                     # Auth screens loader ✓
└── admin/(dashboard)/layout.tsx        # Dashboard route group
    ├── page.tsx                        # Dashboard home
    └── loading.tsx                     # Dashboard root loader ✓
```

### Dashboard Resources (15 CRUD + Utilities)

**Core CRUD Resources** (8 with full CRUD support):
- customers, spaces, reservations, staff, locations, news, posts, coupons

**Partial CRUD** (7 with edit/view only):
- terms, faq, terms, pages, inquiries, audit-logs, media

**Non-CRUD Utilities** (3 with no CRUD):
- settings (6 tab-based sub-routes), reservations/calendar, posts/taxonomy

**Total**: 65+ route segments, 738 TypeScript/TSX files

---

## 2. SHARED COMPONENTS & ASSETS DIRECTORY

Path: `src/app/(admin)/admin/(dashboard)/_shared/` (high specialization)

### Actions (33 files, 6,757 lines total)

**Organized by:**
- Settings subsystem: 7 files (`schemas.ts`, `mutations.ts`, `google-calendar.ts`, `other.ts`, `stripe.ts`, `business.ts`, `email.ts`, etc.)
- Reservation operations: 3 files (`mutations.ts`, `admin.ts`, `index.ts` barrel)
- API keys management: 3 files (`mutations.ts`, `index.ts`)
- Post/content: `mutations.ts` (474 lines) + single-file actions

**Large files** (>300 lines):
- `settings/schemas.ts`: 529 lines (Zod schemas) 🔴
- `post/mutations.ts`: 474 lines 🔴
- `fetch-ogp.ts`: 332 lines (utility)
- `api-keys/mutations.ts`: 324 lines
- `settings/google-calendar.ts`: 294 lines
- `faq.ts`: 288 lines
- `news.ts`: 285 lines

**Pattern**: Split pattern used for large domains (settings, post, reservation, terms, api-keys), single-file for smaller domains

### Components (Highly specialized, 100+ files)

**Lexical Editor Subsystem** (200+ files):
- `lexical/nodes/`: 20+ node types (CalloutNode, TabsContainerNode, LayoutContainerNode, etc.)
- `lexical/plugins/`: 15+ plugins (ToolbarPlugin 844 lines, FloatingToolbarPlugin 894 lines, TabsPlugin 607 lines)
- `lexical/config/`: Schema registration, insert items (797 lines)
- `lexical/preview/`: Preview rendering
- `lexical/dialogs/`: Modal editors (link, image, table)
- `lexical/inspector/`: Dev inspection tools

**Shared UI Components** (27 files):
- Shadcn/ui primitives: Button, Input, Dialog, Select, Table, Tabs, etc.
- Admin-specific: `SubmitButton`, `PublishSwitch`, `Pagination`
- **Missing**: Centralized `ActionDropdown` component (duplicated per resource)

**Supporting Systems**:
- `media-picker/`: Upload/selection modal (component + tabs)
- `table/`: `BaseFilters.tsx` (3291 lines) — search bar base
- `seo/`: Metadata editor
- `cta-button-editor/`: CTA editor (new feature)
- `comment-panel/`: Collaborative comments (546 lines)

### Hooks (3 shared, resource-specific hooks in component files)

1. **useFormAction**: RHF + Server Action integration
   - Handles form submission, optimistic updates
   - Type-safe validation via Zod
   
2. **useKanaInput**: Japanese IME-aware input
   - Auto-converts to katakana/hiragana
   - Used in customer name fields
   
3. **useFilterParams**: Nuqs wrapper for URL filter state
   - Handles pagination, search, sorting
   - Debounced search

### Lib (Utilities, validators, helpers)

**Validation Schemas** (11 files, admin-specific):
- `validations/space.ts`: 6,957 lines 🔴 (HUGE)
- `validations/post.ts`: 5,697 lines 🔴 (HUGE)
- `validations/admin-reservation.ts`: 6,315 lines 🔴 (HUGE)
- `validations/media.ts`: 8,534 lines 🔴 (HUGE)
- Also: `faq.ts`, `news.ts`, `stripe.ts`, `api-keys.ts`, etc.

⚠️ **Inconsistency**: Admin validation schemas live in `_shared/lib/validations/` NOT `@/shared/lib/validations/` (violates rule pattern)

**Other utilities**:
- `permissions.ts`: 473 lines (RBAC checks for admin actions)
- `instagram.ts`: 464 lines (Instagram API integration)
- `calendar/`: Google Calendar sync utilities
- `api-keys/`: API credential management
- `styles/`: CSS utilities for admin theme

### Types (5 files, minimal)

- `server-actions.ts`: AuditUser re-export (11 lines)
- `media-picker.ts`: MediaPickerSelection type
- `admin-layout.ts`: Layout configuration types
- `editor-comment.ts`: Comment data structure
- `api-keys.ts`: API key types

### Queries (Domain-driven, minimal in _shared)

Most database queries live in domain directories (`@/admin/queries/`), not in `_shared/`.

---

## 3. CRUD PATTERN ANALYSIS

### Standard Resource Structure (Customers example)

```
customers/
├── page.tsx                    # List (Suspense-wrapped server)
├── error.tsx                   # Error boundary ✓
├── loading.tsx                 # ✗ MISSING
├── new/
│   └── page.tsx               # New form (AdminDetailLayout)
├── [id]/
│   ├── page.tsx               # Detail view (read-only)
│   ├── edit/
│   │   └── page.tsx           # Edit form (AdminDetailLayout)
│   └── _components/
│       ├── CustomerDangerZone.tsx  # Delete confirmation
│       └── CustomerDetail.tsx      # Display card
└── _components/
    ├── CustomerTable.tsx       # List table (server-rendered)
    ├── CustomerFilters.tsx     # Search/filter bar (client)
    ├── CustomerForm.tsx        # New form ('use client')
    ├── CustomerEditForm.tsx    # Edit form ('use client')
    └── CustomerActionCell.tsx  # Dropdown actions (delete, edit)
```

### Pattern Variation Matrix

| Resource | List Type | New Form | Edit Form | Detail | Has List Route | Editor |
|----------|-----------|----------|-----------|--------|---|----------|
| customers | Table | Form | EditForm | ✓ | ✓ | — |
| spaces | Table | Form | EditForm | ✓ | ✓ | — |
| reservations | Table | Form | EditForm | ✓ | ✓ | — |
| staff | Table | Form | EditForm | ✓ | ✓ | — |
| news | Table | **Lexical** | — | — | ✓ | Lexical |
| posts | Table | **Lexical** | — | — | ✓ | Lexical |
| coupons | Table | Form | — | ✓ | ✓ | — |
| terms | Inline | **Inline Edit** | Inline | ✓ | ✓ | Lexical |
| faq | Inline | Inline | Inline | — | ✓ | Lexical |
| locations | — | Form | EditForm | ✓ | ✗ | — |
| pages | Table | — | Lexical | — | ✓ | Lexical |
| inquiries | Table | — | — | ✓ | ✓ | — |
| audit-logs | Table | — | — | — | ✓ | — |
| media | Table | Upload | — | — | ✓ | — |
| settings | Tabs | — | — | — | ✓ | Mixed |

### Form Component Naming

**Inconsistent naming conventions**:

1. **Dual forms** (New + Edit):
   - `CustomerForm` (new) + `CustomerEditForm` (edit) ← explicit "Edit" suffix
   - `ReservationForm` + `ReservationEditForm` ← consistent
   - `LocationForm` (single file, conditional `existingLocation?` prop) ← shared

2. **Single form** (Lexical editors):
   - `NewsEditor` (new only, confusing name)
   - `TermsInlineEditor` (inline edit, 1009 lines)
   - `FaqItemInlineEditor` (inline edit, 514 lines)

**Pattern problem**: No clear naming convention for "new vs edit" forms

### List Page Patterns

**All use `<Suspense>`**:

```typescript
// page.tsx (Server Component)
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

async function CustomerList({ searchParams }: { searchParams: SearchParams }) {
  const params = await loadAdminCustomerSearchParams(searchParams);
  const result = await getCustomers(...);
  return <CustomerTable data={result.data} />;
}

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<LoadingState />}>
      <CustomerList searchParams={searchParams} />
    </Suspense>
  );
}
```

**Pattern consistent**: All list pages wrap expensive queries. **Issue**: No per-resource `loading.tsx` fallback.

---

## 4. LOADING & ERROR BOUNDARY COVERAGE

### Error Boundaries

✓ **16 resources with error.tsx**:
- customers, spaces, reservations, staff, news, posts, coupons, terms, faq, inquiries, audit-logs, media, pages, settings

✗ **2 missing error.tsx**:
- `locations` (new resource?)
- `space-categories` (child route?)

**Coverage**: 87% — **ACCEPTABLE but should be 100%**

### Loading States

✓ **Only 1 resource with loading.tsx** (root `(dashboard)/loading.tsx`)

✗ **19 resources MISSING loading.tsx**:
- customers, spaces, reservations, staff, news, posts, coupons, terms, faq, inquiries, audit-logs, media, pages, settings, locations, space-categories, posts/taxonomy, posts/comments, reservations/calendar

**Coverage**: 6% — **CRITICAL ISSUE**

**Impact**: During Suspense boundary loading, users see generic root skeleton instead of per-segment feedback. Per Next.js 16 best practices, each segment with dynamic data should have local `loading.tsx`.

---

## 5. COMPONENT REUSE & PATTERNS

### ✓ Good: Shared UI Component Library

27 components in `_shared/components/ui/`:
- Shadcn/ui foundation (Button, Input, Dialog, Select, Table, Tabs, etc.)
- Admin extensions: `SubmitButton`, `PublishSwitch`, `Pagination`
- **Pattern**: All admin forms use `SubmitButton` (not inline `isPending ? "..." : "..."`)

### ✓ Good: Shared Hooks

1. **useFormAction**: RHF + Server Action wrapper
   - Handles validation, submission, toast notifications
   - Used in 8+ form components

2. **useKanaInput**: IME awareness for Japanese input
   - Customer names, location names, etc.

3. **useFilterParams**: Nuqs + pagination + search
   - Central pattern for all list filters

### ✗ Bad: Duplicated ActionCell Pattern

**No centralized ActionDropdown component** — each resource reimplements:

```
customers/_components/CustomerActionCell.tsx
spaces/_components/SpaceActionCell.tsx
news/_components/NewsActionCell.tsx
... (10+ duplicates)
```

**Pattern should be**:
- Centralized: `_shared/components/ActionDropdown.tsx`
- Resource-specific wrapper: `_components/ResourceActionCell.tsx` (configures actions only)

### ✓ Good: Lexical Editor System

Well-organized subsystem:
- Feature-driven: `plugins/`, `nodes/`, `config/`, `dialogs/`, `preview/`
- Central node registration: `config/nodes.ts`
- Plugin architecture: Add/remove plugins via config
- **Issue**: Some plugin files >800 lines (ToolbarPlugin, FloatingToolbarPlugin)

---

## 6. LARGE FILE ANALYSIS (500+ LINES)

| File | Lines | Severity | Refactoring Suggestion |
|------|-------|----------|----------------------|
| **SpaceEditForm.tsx** | 1,407 | 🔴 CRITICAL | Split: BasicInfo / LocationsSection / ImagesSection / PricingSection |
| **TermsInlineEditor.tsx** | 1,009 | 🔴 CRITICAL | Extract: EditorToolbar / EditorContent / PublishBar |
| **FloatingToolbarPlugin.tsx** | 894 | 🟠 HIGH | Extract toolbar logic into command handlers |
| **TaxonomyEditor.tsx** | 889 | 🟠 HIGH | Split: CategoryManager / TagManager / DragDropLogic |
| **ToolbarPlugin.tsx** | 844 | 🟠 HIGH | Extract command registry into separate file |
| **insert-items.ts** | 797 | 🟠 HIGH | Extract item categories into separate files |
| **BusinessHoursSection.tsx** | 643 | 🟠 HIGH | Extract: DayScheduleCard / BusinessHourRow |
| **HomepageTab.tsx** | 601 | 🟠 HIGH | Extract: SectionList / SectionForm |
| **CommentPanel.tsx** | 546 | 🟡 MEDIUM | Extract: CommentThread / CommentInput / CommentList |
| **InstagramSection.tsx** | 543 | 🟡 MEDIUM | Extract: InstagramSettingsForm / CredentialSection |
| **post/mutations.ts** | 474 | 🟡 MEDIUM | Create `post/queries.ts` or `post/metadata.ts` |
| **CategoryManager.tsx** | 531 | 🟡 MEDIUM | Extract: CategoryForm / CategoryList |
| **ReservationForm.tsx** | 463 | 🟡 MEDIUM | Extract: DateTimeSection / GuestSection |
| **ReservationEditForm.tsx** | 452 | 🟡 MEDIUM | Extract: StatusSection / RemarksSection |
| **permissions.ts** | 473 | 🟡 MEDIUM | Organize: RBAC helpers into function groups |
| **instagram.ts** | 464 | 🟡 MEDIUM | Extract: InstagramAPI / AuthFlow / DataFetch |

**Total of 16 files exceeding 450 lines** — 4 critical (>1000), 6 high (>800), 6 medium (450–800)

---

## 7. ARCHITECTURAL CONSISTENCY ISSUES

### ✗ Issue #1: Missing Loading States (19 resources)

**Severity**: HIGH

| Segment | Has loading.tsx | Impact |
|---------|---|---|
| (dashboard) | ✓ | Root fallback for all children |
| customers | ✗ | Users see generic loader during query |
| spaces | ✗ | Users see generic loader |
| reservations | ✗ | Users see generic loader |
| (14 more) | ✗ | Users see generic loader |

**Fix**: Add `loading.tsx` to each resource:

```typescript
// customers/loading.tsx
import { LoadingState } from "@/admin/components/LoadingState";
export default function Loading() {
  return <LoadingState />;
}
```

### ✗ Issue #2: Inconsistent Validation Schema Location

**Severity**: MEDIUM

- Admin-specific schemas in `_shared/lib/validations/` ✗ (violates rule)
- Should be in `@/admin/lib/validations/` ✓

**Current**:
```typescript
// ✗ Wrong location
import { customerFormSchema } from "@/admin/lib/validations/customer";
```

**Should be**:
```typescript
// ✓ Correct location
import { customerFormSchema } from "@/shared/lib/validations/customer";
// OR
import { customerFormSchema } from "@/admin/lib/validations/customer";
```

### ✗ Issue #3: Inconsistent Detail Page Implementation

**Severity**: LOW

- Some resources use `AdminDetailLayout` component
- Others manually build header with Button/Link/ArrowLeft
- No consistent pattern adoption

**Example inconsistency**:
```typescript
// ✓ Correct pattern (AdminDetailLayout)
<AdminDetailLayout backHref="/admin/customers" title="顧客 #123">
  <CustomerDetail />
</AdminDetailLayout>

// ✗ Manual implementation (also present)
<div className="flex items-center gap-4">
  <Link href="/admin/customers"><ArrowLeft /></Link>
  <h1>顧客 #123</h1>
</div>
<CustomerDetail />
```

### ✗ Issue #4: Duplicated ActionCell Pattern

**Severity**: LOW

10+ resource-specific `*ActionCell.tsx` components exist. Should consolidate to:

```typescript
// _shared/components/ActionDropdown.tsx
export function ActionDropdown({ children }) { ... }

// customers/_components/CustomerActionCell.tsx (simple wrapper)
export function CustomerActionCell({ id }) {
  return (
    <ActionDropdown>
      <ActionDropdownItem href={`/admin/customers/${id}/edit`}>編集</ActionDropdownItem>
      <ActionDropdownSeparator />
      <ActionDropdownItem destructive onClick={() => ...}>削除</ActionDropdownItem>
    </ActionDropdown>
  );
}
```

### ✗ Issue #5: Settings Page Subsystem Too Large

**Severity**: MEDIUM

6 tab-based settings pages (site, business, api, notify, announcement-bar, navigation, system) with:
- 5 components >500 lines each
- No consistent sectioning pattern
- Each tab independently manages state

**Fix**: Systematic refactoring of BusinessHoursSection, HomepageTab, InstagramSection, etc.

---

## 8. SUMMARY CHECKLIST

| Category | Metric | Status |
|----------|--------|--------|
| **Coverage** | Resources with error.tsx | 14/16 (87%) ✓ |
| **Coverage** | Resources with loading.tsx | 1/16 (6%) ✗ CRITICAL |
| **Quality** | Large files (>500 lines) | 16 files 🔴 |
| **Quality** | Validation schema location consistency | Inconsistent 🟠 |
| **Patterns** | ActionCell duplication | 10+ components 🟠 |
| **Patterns** | Detail page layout consistency | Inconsistent 🟠 |
| **Organization** | Form naming convention | Inconsistent 🟡 |
| **Organization** | Action file organization | Split pattern partial 🟡 |

---

## 9. RECOMMENDED ACTIONS (Priority Order)

### 🔴 CRITICAL (Do immediately)

1. **Add loading.tsx to 19 resources**
   - Copy pattern from `(dashboard)/loading.tsx`
   - Affects UX significantly

2. **Add error.tsx to 2 missing resources**
   - locations, space-categories

### 🟠 HIGH (Next sprint)

3. **Refactor large form files**
   - SpaceEditForm (1,407 → split into 4 components)
   - TermsInlineEditor (1,009 → split into 3 components)
   - TaxonomyEditor (889 → split into 3 components)

4. **Extract centralized ActionDropdown component**
   - Eliminate 10+ duplicates
   - Create `_shared/components/ActionDropdown.tsx`

5. **Consolidate validation schema locations**
   - Move `_shared/lib/validations/*` to `@/admin/lib/validations/*`
   - Update all imports

### 🟡 MEDIUM (Next quarter)

6. **Standardize detail page implementation**
   - Audit all detail pages
   - Enforce AdminDetailLayout pattern

7. **Refactor Settings page subsystems**
   - Split BusinessHoursSection, HomepageTab, InstagramSection
   - Extract repeating form patterns

8. **Create form naming convention guide**
   - Document when to use Form vs Editor vs InlineEditor
   - Document New vs Edit naming

---

## 10. KEY FILE LOCATIONS

### Core Admin Files

| File | Purpose |
|------|---------|
| `src/app/(admin)/admin/layout.tsx` | Admin root layout |
| `src/app/(admin)/admin/(dashboard)/layout.tsx` | Dashboard wrapper |
| `src/app/(admin)/admin/(dashboard)/_shared/` | Admin shared assets |
| `src/app/(admin)/admin/(dashboard)/_shared/components/ui/` | 27 UI components |
| `src/app/(admin)/admin/(dashboard)/_shared/actions/` | 33 Server Actions |
| `src/app/(admin)/admin/(dashboard)/_shared/lib/validations/` | Admin Zod schemas |
| `src/app/(admin)/admin/(dashboard)/_shared/hooks/` | 3 shared hooks |

### Resource Examples

| Resource | List | Detail | Form | Edit |
|----------|------|--------|------|------|
| customers | `customers/page.tsx` | `customers/[id]/page.tsx` | `customers/new/page.tsx` + `_components/CustomerForm.tsx` | `customers/[id]/edit/page.tsx` + `_components/CustomerEditForm.tsx` |
| spaces | Similar structure | | | |
| news | Uses Lexical editor instead of standard form | | | |

