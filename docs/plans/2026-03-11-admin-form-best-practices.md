# Admin Form Best Practices — Design Doc

## Overview

This document consolidates emerging patterns from the current codebase and proposes 
standardized patterns for CRUD form development in the admin dashboard.

**Current Status:**
- Customers: Full CRUD (separate create/edit forms, 99% code duplication)
- Coupons: Unified form (single component handles both create and edit) 
- **Pattern Goal:** Unify on unified form approach for all CRUD resources

## Pattern Comparison

### Pattern A: Separate Forms (CustomerForm + CustomerEditForm) 
❌ NOT RECOMMENDED

Files:
- CustomerForm.tsx (create only)
- CustomerEditForm.tsx (edit only) 
- Pages: new/page.tsx + [id]/edit/page.tsx

Pros: Explicit separation
Cons: 99% code duplication, maintenance nightmare, inconsistent error handling

### Pattern B: Unified Form (CouponForm) 
✅ RECOMMENDED

Files:
- CouponForm.tsx (handles both create and edit)
- Pages: new/page.tsx + [id]/page.tsx (detail page embeds form)

Pros:
- Single source of truth
- DRY principle
- Feature parity guaranteed
- Clear isEdit logic

Cons: Slightly more component logic

## Key Pattern Details

### 1. Form Component (src/app/(admin)/admin/(dashboard)/<resource>/_components/<Resource>Form.tsx)

Single component with optional prop:
- coupon?: CouponData (undefined = create mode, defined = edit mode)
- useFormAction hook manages form state
- Both create and update Server Actions handled
- defaultValues populated from prop when editing

### 2. Create Page (new/page.tsx)

Server Component using AdminDetailLayout:
- Renders <Resource>Form without prop
- Clean minimal page.tsx
- Header/back button handled by layout

### 3. Detail Page ([id]/page.tsx)

Server Component + Client Detail Component:
- Displays read-only data via <Resource>Detail
- Edit button in AdminDetailLayout actions
- DangerZone for delete at bottom
- Sidebar for status/notes controls

### 4. Edit Page ([id]/edit/page.tsx)

Server Component using AdminDetailLayout:
- Renders <Resource>Form with resource prop
- backLabel="詳細に戻る" (required for edit pages)
- Fetches data server-side, passes to form

### 5. Detail Component ([id]/_components/<Resource>Detail.tsx)

Client Component:
- 2-column layout (main content + sidebar)
- Main: DetailSection components for read-only info
- Sidebar: Status selector, notes editor, quick actions
- All interactive controls use separate Server Actions

### 6. Danger Zone ([id]/_components/<Resource>DangerZone.tsx)

Client Component at page bottom:
- DeleteConfirmDialog for confirmation
- Redirects to list after success
- Toast notifications

### 7. Action Cell (table operation menu)

Client Component using ActionDropdown:
- Links for navigation (detail, edit)
- Buttons for dialogs (delete)
- Destructive action at bottom

## Migration Plan

### For Customers Resource:

Phase 1: Create Unified Form
- Merge CustomerForm.tsx + CustomerEditForm.tsx
- Add optional customer?: CustomerWithReservations prop
- Test in isolation

Phase 2: Update Routes
- Create customers/[id]/edit/page.tsx (new route)
- Update customers/[id]/page.tsx for detail component
- Update customers/new/page.tsx to use unified form

Phase 3: Delete Duplicates
- Remove CustomerEditForm.tsx
- Remove redundant code

Phase 4: Test
- E2E tests for create/edit flows
- Verify error handling

## Post-Migration Structure

```
<resource>/
├── new/page.tsx              (create)
├── page.tsx                  (list)
├── [id]/
│   ├── page.tsx              (detail)
│   ├── edit/page.tsx         (edit - NEW)
│   └── _components/
│       ├── <Resource>Detail.tsx
│       └── <Resource>DangerZone.tsx
└── _components/
    ├── <Resource>Form.tsx    (unified create/edit)
    ├── <Resource>ActionCell.tsx
    └── <Resource>Filters.tsx (optional)
```

## Key Implementation Points

1. useFormAction hook handles:
   - Zod schema validation
   - Server Action execution (create/update)
   - Field-level error display
   - Redirect/refresh on success
   - Toast notifications

2. Unified Form Pattern:
   - Optional prop determines mode
   - isEdit = !!resource flag
   - Both actions handled at call site
   - Same field layout for both modes
   - Conditional button labels

3. Route Structure:
   - /new for create
   - /[id] for detail
   - /[id]/edit for edit (not /new)
   - Enables future feature: detail-view-only pages

4. AdminDetailLayout:
   - Provides header + back button
   - actions prop for edit/save buttons
   - Consistent styling across all detail pages

## All Resources to Migrate

Coupons: ✅ Already unified
Customers: ❌ Needs migration (separate forms)
Locations: Check current pattern
Reservations: Check current pattern
Categories: Check current pattern
Spaces: Check current pattern
News: Check current pattern
Posts: Check current pattern
Settings: Special case (singleton)

