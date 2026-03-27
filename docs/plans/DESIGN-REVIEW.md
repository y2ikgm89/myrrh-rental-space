# Admin Form Best Practices — Complete Design Review

**Date:** 2026-03-13  
**Status:** Design Review (Ready for feedback)  
**Next Step:** Implementation planning

---

## Executive Summary

After analyzing the admin dashboard CRUD patterns, I've identified:

1. **Two competing patterns** in current codebase
2. **Clear winner:** Unified form pattern (Coupons) reduces code duplication by ~500 lines per resource
3. **Recommendation:** Standardize all CRUD resources on unified pattern

### Current Situation

- **Customers:** Separate `CustomerForm.tsx` + `CustomerEditForm.tsx` (99% duplicate) ❌
- **Coupons:** Single `CouponForm.tsx` handles both create and edit ✅

### Why Unified Form Wins

| Aspect           | Separate Forms       | Unified Form           |
| ---------------- | -------------------- | ---------------------- |
| Code duplication | 99%                  | 0%                     |
| Maintenance      | 2 components to sync | 1 component            |
| Feature parity   | Risk of divergence   | Guaranteed parity      |
| Route structure  | new + [id]/edit      | new + [id] + [id]/edit |
| Learning curve   | Easier               | Slightly more complex  |

---

## Pattern Details

### Pattern: Unified Form (RECOMMENDED)

Component: `<Resource>Form.tsx`

```typescript
'use client';

type <Resource>FormProps = {
  <resource>?: <Resource>Data;
};

export function <Resource>Form({ <resource> }: <Resource>FormProps) {
  const isEdit = !!<resource>;

  const { form, isPending, onSubmit } = useFormAction(
    <resource>FormSchema,
    async (data) => {
      if (isEdit) {
        return update<Resource>(<resource>.id, data);
      }
      return create<Resource>(data);
    },
    {
      redirectTo: `/admin/<resources>`,
      successMessage: isEdit
        ? '<Resource>を更新しました'
        : '<Resource>を作成しました',
      defaultValues: <resource>
        ? { /* existing */ }
        : { /* defaults */ },
    },
  );

  return (
    <form onSubmit={onSubmit}>
      <Card className="p-6">
        {/* All form fields */}
        <SubmitButton
          label={isEdit ? 'Save' : 'Create'}
          pendingLabel={isEdit ? 'Saving...' : 'Creating...'}
        />
      </Card>
    </form>
  );
}
```

Key Points:

- Optional prop determines mode
- Single source of truth (isEdit)
- Both Server Actions handled
- Same layout for create and edit

---

## Route Structure

### Create: `new/page.tsx`

```typescript
<AdminDetailLayout
  backHref="/admin/<resources>"
  title="New <Resource>"
>
  <<Resource>Form />  {/* No prop = create */}
</AdminDetailLayout>
```

### Detail: `[id]/page.tsx`

```typescript
<AdminDetailLayout
  backHref="/admin/<resources>"
  title={<resource>.name}
  actions={
    <Button asChild>
      <Link href={`/admin/<resources>/${id}/edit`}>Edit</Link>
    </Button>
  }
>
  <<Resource>Detail />
  <<Resource>DangerZone />
</AdminDetailLayout>
```

### Edit: `[id]/edit/page.tsx` (NEW)

```typescript
<AdminDetailLayout
  backHref={`/admin/<resources>/${id}`}
  backLabel="詳細に戻る"  {/* REQUIRED */}
  title="Edit <Resource>"
>
  <<Resource>Form <resource>={<resource>} />  {/* With prop = edit */}
</AdminDetailLayout>
```

**Structure Summary:**

- `/new` → Form without prop (create)
- `/[id]` → Detail component
- `/[id]/edit` → Form WITH prop (edit)

---

## File Structure

### Before (Customers)

```
customers/
├── new/page.tsx
├── [id]/page.tsx (detail only)
└── _components/
    ├── CustomerForm.tsx (create)
    ├── CustomerEditForm.tsx (edit) ← 99% duplicate
    └── CustomerDetail.tsx
```

### After (Recommended)

```
customers/
├── new/page.tsx
├── [id]/
│   ├── page.tsx (detail)
│   ├── edit/page.tsx (NEW)
│   └── _components/
│       ├── CustomerDetail.tsx
│       └── CustomerDangerZone.tsx
└── _components/
    ├── CustomerForm.tsx (unified)
    └── CustomerActionCell.tsx
```

---

## Migration Plan

### Phase 1: Customers (High Priority)

1. Create unified `CustomerForm.tsx`
2. Create `[id]/edit/page.tsx`
3. Update `[id]/page.xyz`
4. Delete `CustomerEditForm.tsx`
5. Test E2E flows

### Phase 2: Other Resources

- Locations, Reservations, Categories, Spaces
- Follow same pattern

### Phase 3: Documentation

- Update CLAUDE.md
- Create style guide

---

## Code Duplication Analysis

CustomerForm vs CustomerEditForm:

- Form fields: 100% identical
- Validation: Same schema
- Button layout: 100% identical
- Differences: defaultValues + labels only

**Result:** 230+ duplicate lines per resource

---

## Decision Matrix

| Factor         | Unified       | Separate |
| -------------- | ------------- | -------- |
| Duplication    | ✅ None       | ❌ 99%   |
| Maintenance    | ✅ High       | ❌ Low   |
| Feature parity | ✅ Guaranteed | ❌ Risk  |

**Winner:** Unified Form

---

## Implementation Notes

### useFormAction Hook

- Zod validation
- Server Action execution
- Field-level errors
- Redirect/refresh
- Toast notifications

### AdminDetailLayout

- Standardized header
- Title + subtitle
- Back button (left)
- Action buttons (right)

### Edit Page backLabel Rule

Edit pages MUST include `backLabel="詳細に戻る"`:

```tsx
<AdminDetailLayout
  backHref={`/admin/customers/${id}`}
  backLabel="詳細に戻る"  {/* REQUIRED */}
/>
```

---

## Review Checklist

- [ ] Approve unified form pattern
- [ ] Confirm route structure
- [ ] Confirm backLabel requirement
- [ ] Confirm danger zone placement
- [ ] Any exceptions to this pattern?
- [ ] Multi-step forms?
- [ ] Bulk operations?

---

## Next Steps

1. ✅ Design doc created
2. ⏳ Design review (this doc)
3. ⏳ Approval
4. ⏳ Implementation
5. ⏳ Documentation update
