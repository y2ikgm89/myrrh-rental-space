# Admin Form Patterns

## Current State (As of 2026-03-13)

Two competing patterns exist in the codebase:

### Pattern A: Separate Create/Edit Forms (Customers)
- `CustomerForm.tsx` (create only)
- `CustomerEditForm.tsx` (edit only) — **99% duplicate code**
- Routes: `new/page.tsx`, `[id]/edit/page.tsx`
- ❌ NOT RECOMMENDED — maintenance burden, code duplication

### Pattern B: Unified Form (Coupons) 
- `CouponForm.tsx` (handles both create and edit)
- Routes: `new/page.tsx`, `[id]/page.tsx` (detail embeds form in AdminDetailLayout)
- ✅ RECOMMENDED — DRY principle, feature parity guaranteed

## Unified Form Component Pattern

```typescript
type FormProps = {
  resource?: ResourceData;  // undefined = create, defined = edit
};

export function ResourceForm({ resource }: FormProps) {
  const isEdit = !!resource;
  
  const { form, isPending, onSubmit } = useFormAction(
    schema,
    async (data) => isEdit ? updateResource(resource.id, data) : createResource(data),
    {
      redirectTo: `/admin/resources`,
      successMessage: isEdit ? "Updated" : "Created",
      defaultValues: resource ? { /* existing */ } : { /* defaults */ },
    },
  );
  
  // Form fields...
  // <SubmitButton label={isEdit ? "Save" : "Create"} />
}
```

## Route Structure

- `new/page.tsx` — Create route (renders form without prop)
- `[id]/page.tsx` — Detail route (renders ResourceDetail component)
- `[id]/edit/page.tsx` — Edit route (renders form WITH prop)
- `[id]/[id]/_components/ResourceDetail.tsx` — Read-only detail (Client Component with sidebar controls)
- `[id]/[id]/_components/ResourceDangerZone.tsx` — Delete zone at page bottom

## AdminDetailLayout Usage

**Create page:**
```tsx
<AdminDetailLayout
  backHref="/admin/resources"
  title="New Resource"
  subtitle="Create a new resource"
>
  <ResourceForm />
</AdminDetailLayout>
```

**Edit page:**
```tsx
<AdminDetailLayout
  backHref={`/admin/resources/${id}`}
  backLabel="詳細に戻る"  ← REQUIRED for edit pages
  title="Edit Resource"
  subtitle={resource.name}
>
  <ResourceForm resource={resource} />
</AdminDetailLayout>
```

**Detail page:**
```tsx
<AdminDetailLayout
  backHref="/admin/resources"
  title={resource.name}
  actions={
    <Button asChild>
      <Link href={`/admin/resources/${resource.id}/edit`}>Edit</Link>
    </Button>
  }
>
  <ResourceDetail resource={resource} />
  <ResourceDangerZone resourceId={resource.id} />
</AdminDetailLayout>
```

## Resources Using Each Pattern

- Coupons: ✅ Unified form (pattern B)
- Customers: ❌ Separate forms (pattern A) — needs migration
- Locations: Need to verify
- Reservations: Need to verify
- Categories: Need to verify
- Spaces: Need to verify
- News/Posts: Need to verify

## Migration Priority

1. **Customers** — Largest duplication (>500 lines of duplicate form code)
2. Other CRUD resources that follow separate form pattern
3. Update CLAUDE.md with standardized pattern
