# Admin Panel CRUD Patterns Analysis

## Project Overview
- **Date**: 2026-03-13
- **Focus**: Deep analysis of admin panel CRUD patterns
- **Scope**: 3 representative resources (locations, customers, spaces) + ActionCell duplication + form architecture

---

## 1. Resource DIRECTORY STRUCTURES

### Simple Resource: LOCATIONS
```
locations/
├── page.tsx                    # LIST (missing - see note below)
├── [id]/
│   ├── page.tsx               # DETAIL
│   ├── edit/page.tsx          # EDIT
│   └── _components/
│       └── LocationDetail.tsx
├── new/
│   └── page.tsx               # CREATE
└── _components/
    ├── LocationActionCell.tsx
    ├── LocationFilters.tsx
    ├── LocationForm.tsx
    └── LocationTable.tsx
```

**KEY FINDING**: Locations don't have `page.tsx` (list page). They're accessed via the spaces management tab at `/admin/spaces?tab=locations`. This is the **tabbed CRUD pattern** explained below.

### Medium Resource: CUSTOMERS
```
customers/
├── page.tsx                   # LIST with pagination + suspense
├── new/page.tsx              # CREATE
├── [id]/
│   ├── page.tsx              # DETAIL
│   ├── edit/page.tsx         # EDIT
│   └── _components/
│       ├── CustomerDetail.tsx (Client Component)
│       └── CustomerDangerZone.tsx
├── error.tsx                 # Error boundary
└── _components/
    ├── CustomerActionCell.tsx
    ├── CustomerEditForm.tsx
    ├── CustomerFilters.tsx
    ├── CustomerForm.tsx
    └── CustomerTable.tsx
```

### Complex Resource: SPACES
```
spaces/
├── page.tsx                  # TAB WRAPPER (SpaceManagementTabs)
├── [id]/
│   ├── page.tsx             # DETAIL
│   ├── edit/page.tsx        # EDIT
│   └── _components/
│       └── SpaceDetail.tsx
├── new/page.tsx             # CREATE
├── error.tsx                # Error boundary
└── _components/
    ├── SpaceActionCell.tsx
    ├── SpaceEditForm.tsx
    ├── SpaceFilters.tsx
    ├── SpaceManagementTabs.tsx    # ← Tab management for 3 tabs
    ├── SpaceTable.tsx
    ├── SpaceTabContent.tsx        # Spaces tab content
    ├── LocationTabContent.tsx     # Locations tab content
    ├── CategoryTabContent.tsx     # Categories tab content
    └── ...
```

---

## 2. LIST PAGE PATTERNS

### Standard Pattern (Customers)
**File**: `src/app/(admin)/admin/(dashboard)/customers/page.tsx`

```typescript
// Key architecture:
// 1. Metadata static export
// 2. Async page with Suspense boundaries
// 3. Split into async sub-component (CustomerList) for data fetching
// 4. Header + Filters (Suspense) + Table with Pagination (Suspense)

export const metadata: Metadata = {
  title: "顧客管理 | Myrrh Rental Space",
};

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

async function CustomerList({ searchParams }: { searchParams: SearchParams }) {
  const params = await loadAdminCustomerSearchParams(searchParams);
  const status = parseCustomerStatusFilter(params.status);
  
  const result = await getCustomers(
    omitUndefined({ status, search: params.search || undefined }),
    { page: params.page, limit: 10 },
  );
  
  return (
    <>
      <CustomerTable customers={result.customers} />
      <Pagination {...result} />
    </>
  );
}

export default async function CustomersPage({ searchParams }: PageProps) {
  return (
    <div className="space-y-6">
      {/* Header: 2 row layout (title + button aligned right) */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">顧客管理</h1>
          <p className="text-sm text-muted-foreground sm:text-base">...</p>
        </div>
        <Button asChild><Link href="/admin/customers/new"><Plus />新規顧客</Link></Button>
      </div>

      {/* Filters: Suspense with inline loader */}
      <Suspense fallback={<LoadingState variant="inline" />}>
        <CustomerFilters />
      </Suspense>

      {/* Table + Pagination: Suspense with full loader */}
      <Suspense fallback={<LoadingState />}>
        <CustomerList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
```

**Header CSS**: `text-2xl font-bold tracking-tight text-foreground` (必須)

### Tabbed Pattern (Spaces)
**File**: `src/app/(admin)/admin/(dashboard)/spaces/page.tsx`

```typescript
// No list page — instead 3 tabs managed by SpaceManagementTabs
export default async function SpacesPage({ searchParams }: PageProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">スペース管理</h1>
        <p className="text-sm text-muted-foreground sm:text-base">...</p>
      </div>

      <SpaceManagementTabs
        spacesContent={<SpaceTabContent searchParams={searchParams} />}
        locationsContent={<LocationTabContent searchParams={searchParams} />}
        categoriesContent={<CategoryTabContent searchParams={searchParams} />}
      />
    </div>
  );
}
```

**SpaceManagementTabs useQueryState**:
- `shallow: true` (URL changes, no RSC re-render)
- `forceMount: true` on TabsContent (DOM preserved, CSS `data-[state=inactive]:hidden` hides)
- "新規作成" button inside TabsList right end, shown conditionally per tab

---

## 3. DETAIL PAGE PATTERNS

### Header & Layout (AdminDetailLayout)
**Used by**: All detail pages (customers, locations, spaces, etc.)

```typescript
// locations/[id]/page.tsx
export default async function LocationDetailPage({ params }: PageProps) {
  const { id } = await params;
  const location = await getLocationById(id);
  
  if (!location) notFound();

  return (
    <AdminDetailLayout
      backHref="/admin/spaces?tab=locations"
      title={location.name}
      subtitle="拠点詳細"
      actions={
        <Button size="sm" asChild>
          <Link href={`/admin/locations/${location.id}/edit`}>
            <Pencil className="mr-2 h-4 w-4" />
            編集
          </Link>
        </Button>
      }
    >
      <LocationDetail location={location} />
      <DangerZone
        deleteLabel="場所を削除"
        itemName={location.name}
        onDelete={deleteLocation.bind(null, location.id)}
        redirectTo="/admin/spaces?tab=locations"
      />
    </AdminDetailLayout>
  );
}
```

**AdminDetailLayout**: Provides header with back button, title, subtitle, actions. Children below.

**DangerZone Pattern**:
- Uses `.bind(null, id)` to pass Server Action across RSC boundary
- Placed at **page bottom only**, never in CardHeader
- `onDelete={deleteLocation.bind(null, location.id)}`

### Detail Component (Client Component)
**Example**: `CustomerDetail.tsx` (52-289 lines)

```typescript
"use client";

export function CustomerDetail({ customer }: CustomerDetailProps) {
  const [isPending, startTransition] = useTransition();
  const [notes, setNotes] = useState(customer.notes || "");

  const handleStatusChange = async (status: CustomerStatus) => {
    startTransition(async () => {
      const result = await updateCustomerStatus(customer.id, status);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("ステータスを更新しました");
      router.refresh();
    });
  };

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {/* Main content: md:col-span-2 */}
      <div className="md:col-span-2 space-y-6">
        <DetailSection title="基本情報">
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailField label="..." value="..." />
          </div>
        </DetailSection>

        {/* 予約履歴テーブル */}
        <Card>
          <CardHeader><CardTitle>予約履歴（最新20件）</CardTitle></CardHeader>
          <CardContent>
            {customer.reservations.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">予約履歴がありません</p>
            ) : (
              <Table>
                <TableHeader>...</TableHeader>
                <TableBody>
                  {customer.reservations.map((reservation) => (
                    <TableRow key={reservation.id}>...</TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sidebar: md:col-span-1 */}
      <div className="space-y-6">
        {/* ステータス */}
        <Card>
          <CardHeader><CardTitle>ステータス</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Select value={customer.status} onValueChange={handleStatusChange} disabled={isPending}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NEW">新規</SelectItem>
                ...
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* メモ */}
        <Card>
          <CardHeader><CardTitle>メモ</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            <SubmitButton isPending={isPending} onClick={handleNotesUpdate} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

**Key Patterns**:
- **useTransition** for async inline actions (not Server Action form)
- **grid gap-6 md:grid-cols-3**: Main + Sidebar layout
- **DetailSection** + **DetailField** for styled K-V pairs
- **useRouter().refresh()** to revalidate after mutation
- Inline cards for quick actions (status, notes, toggle)

---

## 4. CREATE & EDIT PAGE PATTERNS

### Create Page (Server Component)
**File**: `locations/new/page.tsx`

```typescript
export const metadata: Metadata = {
  title: "場所新規作成 | Myrrh Rental Space",
};

export default async function NewLocationPage() {
  return (
    <AdminDetailLayout
      backHref="/admin/spaces?tab=locations"
      title="場所新規作成"
      subtitle="新しい場所（建物・施設）を作成します"
    >
      <LocationForm mode="create" />
    </AdminDetailLayout>
  );
}
```

### Edit Page (Server Component)
**File**: `locations/[id]/edit/page.tsx`

```typescript
export default async function EditLocationPage({ params }: PageProps) {
  const { id } = await params;
  const location = await getLocationById(id);

  if (!location) notFound();

  return (
    <AdminDetailLayout
      backHref={`/admin/locations/${location.id}`}
      backLabel="詳細に戻る"
      title="拠点情報を編集"
      subtitle={location.name}
    >
      <LocationForm location={location} mode="edit" />
    </AdminDetailLayout>
  );
}
```

**backLabel Rule**:
- Create/Detail: `backLabel` omitted (default: "一覧に戻る")
- Edit: `backLabel="詳細に戻る"` **必須**

---

## 5. FORM ARCHITECTURE & PATTERNS

### Form Pattern: useFormAction Hook

All forms use **`useFormAction`** hook:

```typescript
const { form, isPending, onSubmit } = useFormAction(
  schema,      // Zod schema
  submitFn,    // async (data) => Promise<MutationResult<T>>
  options      // { defaultValues, redirectTo, successMessage, onSuccess }
);
```

### Simple Form (CustomerForm)
**File**: `customers/_components/CustomerForm.tsx` (237 lines)

```typescript
"use client";

export function CustomerForm(): ReactElement {
  const router = useRouter();

  const { form, isPending, onSubmit } = useFormAction(
    customerFormSchema,
    (data) => createCustomer(data),
    {
      redirectTo: "/admin/customers",
      successMessage: "顧客を作成しました",
    },
  );

  const { register, setValue, formState: { errors } } = form;

  // IME カナ自動入力
  const lastNameKanaInput = useKanaInput({
    onKanaChange: (kana) => setValue("lastNameKana", kana),
  });

  return (
    <form onSubmit={onSubmit}>
      <Card className="p-6">
        <div className="space-y-6">
          {/* 氏名 */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="lastName">姓 <span className="text-destructive">*</span></Label>
              <Input
                id="lastName"
                {...register("lastName")}
                onCompositionStart={lastNameKanaInput.inputProps.onCompositionStart}
                onCompositionUpdate={lastNameKanaInput.inputProps.onCompositionUpdate}
                onCompositionEnd={lastNameKanaInput.inputProps.onCompositionEnd}
                onInput={lastNameKanaInput.inputProps.onInput}
              />
              {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
            </div>
          </div>

          {/* カナ自動入力（リアルタイム） */}
          <Input value={lastNameKanaInput.kana} onChange={(e) => lastNameKanaInput.setKana(e.target.value)} />

          {/* ボタン */}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => router.back()}>キャンセル</Button>
            <SubmitButton isPending={isPending} label="顧客を作成" pendingLabel="作成中..." />
          </div>
        </div>
      </Card>
    </form>
  );
}
```

**Key Pattern**:
- **aria-invalid + aria-describedby** for accessibility
- **IME composition events** for Japanese name input (useKanaInput hook)
- **SubmitButton** with explicit pendingLabel (when complex: "顧客を作成中..." not default)

### Complex Form (LocationForm)
**File**: `locations/_components/LocationForm.tsx` (526 lines)

```typescript
"use client";

export function LocationForm({ location, mode }: LocationFormProps) {
  const router = useRouter();
  const dndContextId = useId();

  const { form, isPending, onSubmit } = useFormAction(
    locationFormSchema,
    (data: LocationFormInput) =>
      mode === "create" ? createLocation(data) : updateLocation(location!.id, data),
    {
      defaultValues: location
        ? {
            imageUrls: location.imageUrls.map((url) => ({ url })),  // string[] → { url }[]
            ...
          }
        : defaultLocationFormValues,
      onSuccess: (data) => {
        if (mode === "create") {
          router.push(`/admin/locations/${data.id}`);
        } else {
          router.push("/admin/spaces?tab=locations");
        }
      },
    },
  );

  // useFieldArray for image management
  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: "imageUrls",
  });

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleImageDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // fields[].id（RHF stable ID）で index 特定
    const oldIndex = fields.findIndex((f) => f.id === String(active.id));
    const newIndex = fields.findIndex((f) => f.id === String(over.id));

    if (oldIndex !== -1 && newIndex !== -1) {
      move(oldIndex, newIndex);  // useFieldArray.move()
    }
  };

  // Media pickers
  const mainImagePicker = useSingleMediaPicker({
    defaultUsage: "SPACE",
    onSelect: (media) => {
      if (media[0]) form.setValue("imageUrl", media[0].url, { shouldValidate: true });
    },
  });

  const additionalImagesPicker = useMultipleMediaPicker({
    defaultUsage: "SPACE",
    maxSelections: 10 - fields.length,  // ← リアクティブ
    onSelect: (media) => {
      if (media.length > 0) {
        const remaining = 10 - fields.length;
        append(media.slice(0, remaining).map((m) => ({ url: m.url })));
      }
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-6">
        {/* Card: 基本情報 */}
        <Card>
          <CardHeader><CardTitle>基本情報</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>場所名 <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <Input {...field} placeholder="例: Myrrhビル" disabled={isPending} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </CardContent>
        </Card>

        {/* Card: 画像設定（複雑: useFieldArray + dnd-kit） */}
        <Card>
          <CardHeader><CardTitle>画像設定</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {/* メイン画像 */}
            <FormField control={form.control} name="imageUrl" render={({ field }) => (
              <FormItem>
                <FormLabel>建物画像 <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <div className="flex items-start gap-4">
                    {field.value ? (
                      <Image src={field.value} alt="..." width={96} height={96} />
                    ) : (
                      <div className="flex h-24 w-24 items-center justify-center rounded-lg border border-dashed">
                        <ImagePlus />
                      </div>
                    )}
                    <Button type="button" variant="outline" onClick={() => mainImagePicker.openPicker()}>
                      <ImagePlus className="mr-2" /> 画像を選択
                    </Button>
                  </div>
                </FormControl>
              </FormItem>
            )} />

            {/* 追加画像（useFieldArray） */}
            <div className="space-y-2">
              <p className="text-sm font-medium">追加画像（最大10枚）</p>
              <Button type="button" variant="outline" onClick={() => additionalImagesPicker.openPicker()} disabled={isPending || fields.length >= 10}>
                <ImagePlus /> 画像を追加
              </Button>

              {fields.length > 0 && (
                <>
                  <p className="text-sm text-muted-foreground">{fields.length} / 10 枚選択中</p>
                  <DndContext id={dndContextId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleImageDragEnd}>
                    <SortableContext
                      items={fields.map((f) => f.id)}  // ← RHF stable ID
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        {fields.map((field, index) => (
                          <SortableImageItem
                            key={field.id}
                            id={field.id}
                            url={field.url}
                            index={index}
                            onRemove={remove}
                            disabled={isPending}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </>
              )}
            </div>

            {/* メディアピッカーダイアログ */}
            <mainImagePicker.MediaPicker />
            <additionalImagesPicker.MediaPicker />
          </CardContent>
        </Card>

        {/* ボタン */}
        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={isPending}>キャンセル</Button>
          <SubmitButton isPending={isPending} label={mode === "create" ? "作成" : "更新"} pendingLabel={mode === "create" ? "作成中..." : "更新中..."} />
        </div>
      </form>
    </Form>
  );
}
```

**Key Patterns**:
- **2-Card Layout**: 基本情報（左）+ 複雑な設定（右）の md:grid-cols-2
- **useFieldArray** for array fields:
  - `fields.map((f) => f.id)` uses RHF stable ID for dnd-kit
  - `fields.length` is reactive (not `form.getValues()`)
  - Conversion: DB `string[]` → Form `{ url: string }[]` → Submit `string[]`
- **DndContext id={dndContextId}**: SSR hydration mismatch防止に useId
- **Media Picker**: Single + Multiple variants, `maxSelections: 10 - fields.length`

---

## 6. ACTION CELL DUPLICATION ANALYSIS

### Comparison of 3 ActionCells

**LocationActionCell** (32 lines)
```typescript
"use client";
export function LocationActionCell({ locationId }: LocationActionCellProps) {
  return (
    <ActionDropdown>
      <ActionDropdownItem href={`/admin/locations/${locationId}/edit`}>編集</ActionDropdownItem>
      <ActionDropdownItem href={`/admin/locations/${locationId}`}>詳細</ActionDropdownItem>
    </ActionDropdown>
  );
}
```

**CustomerActionCell** (31 lines)
```typescript
"use client";
export function CustomerActionCell({ customerId }: CustomerActionCellProps) {
  return (
    <ActionDropdown>
      <ActionDropdownItem href={`/admin/customers/${customerId}/edit`}>編集</ActionDropdownItem>
      <ActionDropdownItem href={`/admin/customers/${customerId}`}>詳細</ActionDropdownItem>
    </ActionDropdown>
  );
}
```

**SpaceActionCell** (32 lines)
```typescript
"use client";
export function SpaceActionCell({ spaceId }: SpaceActionCellProps) {
  return (
    <ActionDropdown>
      <ActionDropdownItem href={`/admin/spaces/${spaceId}/edit`}>編集</ActionDropdownItem>
      <ActionDropdownItem href={`/admin/spaces/${spaceId}`}>詳細</ActionDropdownItem>
    </ActionDropdown>
  );
}
```

### Duplication Summary

| Component | Base Pattern | Differences | Duplication % |
|-----------|--------------|-------------|---------------|
| All 3     | `ActionDropdown` + 2 items | Only ID param & URL path differ | **95%** |
| Complex*  | Base + Dialog/Delete | Would add 5-10% more code | N/A |

**Duplication Score**: 🔴 **HIGH** (all simple "edit + detail" cells are identical except param name)

**Refactor Opportunity**: Generic `StandardActionCell<T>` component with template params:
```typescript
type StandardActionCellProps<T extends string> = {
  id: string;
  idParamName: T;
  basePath: string;
};

export function StandardActionCell<T extends string>({
  id,
  idParamName,
  basePath,
}: StandardActionCellProps<T>) {
  return (
    <ActionDropdown>
      <ActionDropdownItem href={`${basePath}/${id}/edit`}>編集</ActionDropdownItem>
      <ActionDropdownItem href={`${basePath}/${id}`}>詳細</ActionDropdownItem>
    </ActionDropdown>
  );
}
```

**But**: CLAUDE.md admin-ui-patterns states each resource should have its own `*ActionCell`. Reason: domain/future extensibility (delete, custom actions per resource).

**Conclusion**: High duplication is **intentional**. Each resource can extend independently (delete button, status toggle, etc.) without modifying shared component. Trade: 95% code duplication vs. high extensibility.

---

## 7. DETAIL PAGE HEADERS (AdminDetailLayout)

### Pattern Analysis

**All detail pages use `AdminDetailLayout`**:
- `locations/[id]/page.tsx`
- `customers/[id]/page.tsx`
- `spaces/[id]/page.tsx`

**None use manual headers** (no `<div className="flex justify-between">` with manual ArrowLeft).

### AdminDetailLayout Props
```typescript
type AdminDetailLayoutProps = {
  backHref: string;
  backLabel?: string;  // Optional, default: "一覧に戻る"
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
};
```

### Usage Examples

**Detail (with edit button)**:
```typescript
<AdminDetailLayout
  backHref="/admin/customers"
  title={`${customer.lastName} ${customer.firstName}`}
  subtitle={customer.email}
  actions={<Button><Link href={`/admin/customers/${id}/edit`}>編集</Link></Button>}
>
  <CustomerDetail customer={customer} />
  <DangerZone ... />
</AdminDetailLayout>
```

**Edit (back to detail)**:
```typescript
<AdminDetailLayout
  backHref={`/admin/customers/${id}`}
  backLabel="詳細に戻る"  // ← 必須
  title="顧客情報を編集"
  subtitle={`${customer.lastName} ${customer.firstName}`}
>
  <CustomerEditForm customer={customer} />
</AdminDetailLayout>
```

**Create (back to list)**:
```typescript
<AdminDetailLayout
  backHref="/admin/customers"
  title="新規顧客"
  subtitle="新しい顧客情報を登録します"
>
  <CustomerForm />
</AdminDetailLayout>
```

---

## 8. LOADING & ERROR STATES

### Files Present
```
dashboard/
├── loading.tsx          # Root dashboard loader
├── admin/
│   ├── loading.tsx      # Admin section loader
│   └── (auth)/loading.tsx
```

### Resource-Specific Error Boundaries
```
✓ customers/error.tsx
✓ spaces/error.tsx
✓ coupons/error.tsx
✓ news/error.tsx
✓ posts/error.tsx
✓ reservations/error.tsx
✓ settings/error.tsx
... (13 total error.tsx files)

✗ locations/error.tsx  (missing — uses spaces/error.tsx via tab)
```

### Suspense Patterns

**Customers list page**:
```typescript
<Suspense fallback={<LoadingState variant="inline" />}>
  <CustomerFilters />
</Suspense>

<Suspense fallback={<LoadingState />}>
  <CustomerList searchParams={searchParams} />
</Suspense>
```

**Two variants**:
- `variant="inline"` — Light skeleton for filters
- Default — Full page skeleton for table

---

## 9. KEY ARCHITECTURAL DECISIONS

### 1. **Multiple Root Layouts** (admin + public split)
- `(admin)/layout.tsx` — Admin theme, sidebar
- `(public)/layout.tsx` — Public theme, header
- Resources fully isolated per layout group

### 2. **AdminDetailLayout Unification**
- All detail/edit/create pages use `AdminDetailLayout`
- No manual headers with ArrowLeft (auto-provided)
- Subtitle optional, actions flexible

### 3. **useFormAction Hook Abstraction**
- Single hook handles validation, submission, routing
- Consistent `isPending` + `onSubmit`
- `defaultValues` lazy load supported

### 4. **Server Action Boundary Crossing** (.bind)
- DangerZone accepts `onDelete={deleteAction.bind(null, id)}`
- Converts closure to serializable Server Action
- Passed from async page.tsx → 'use client' component

### 5. **Tabbed CRUD vs. Separate Pages**
- **Spaces**: 3 tabs (spaces, locations, categories) in single page
  - `shallow: true` (URL changes, no RSC re-render)
  - `forceMount: true` (DOM preserved)
- **Customers**: Separate pages per resource
  - Simpler pagination/filtering

### 6. **DB→Form Conversion Pattern**
```typescript
// GET: DB string[] → Form { url: string }[]
defaultValues: {
  imageUrls: location.imageUrls.map((url) => ({ url }))
}

// SUBMIT: Form { url: string }[] → DB string[]
const result = await updateLocation(id, data);  // server validates & converts
```

### 7. **useFieldArray for Collections**
- Always use `useFieldArray` (not useState)
- `fields[].id` is RHF-stable for dnd-kit
- `fields.length` is reactive (not `form.getValues().length`)

---

## 10. TECH STACK USED

| Layer | Technologies | Notes |
|-------|--------------|-------|
| **Forms** | React Hook Form v8 + Zod | useFormAction hook wraps both |
| **Drag & Drop** | dnd-kit v8 | LocationForm image reordering |
| **UI** | Radix UI + Tailwind CSS | ActionDropdown, Dialog, Select, etc. |
| **State** | useTransition + useRouter.refresh | For inline actions in detail pages |
| **Server Actions** | Next.js 16 Server Actions | executeAdminMutationResult wrapper |
| **Validation** | Zod + custom guards | parseAsStringLiteral for select values |
| **Search** | nuqs (URL state) + shallow: true/false | Pagination + filtering |
| **IME Input** | useKanaInput hook | Japanese name auto-kana conversion |

---

## 11. DUPLICATION & REFACTOR HOTSPOTS

### ✅ Already Consolidated
- **useFormAction** — Centralized form + submission logic
- **AdminDetailLayout** — Unified headers for detail/edit/create
- **DetailSection + DetailField** — Consistent display patterns
- **ActionDropdown** — Unified dropdown menu

### 🔴 High Duplication (Intentional)
- **\*ActionCell components** — 95% duplicate (edit + detail)
  - **Reason**: Future per-resource extensibility
  - **Cost**: 32 lines × 15 resources = 480 lines boilerplate

### 🟡 Medium Duplication (Fixable)
- **Form Card headers**: "基本情報", "画像設定", "公開設定" repeated
- **Pagination**: `const Pagination = <nav>` pattern duplicated in each page
- **Filter components**: Similar structure across resources

### Refactor Candidates
1. **Generic Form Card Wrapper** (reduces Card+Header boilerplate)
2. **Shared Pagination Component** (imported, not duplicated)
3. **DndContext Wrapper** (LocationForm pattern could be generic)
4. **Standard ActionCell Generator** (runtime factory, but breaks type safety)

---

## 12. GOTCHAS & PATTERNS

### ✓ Correct Patterns Observed
- `export const metadata` (static)
- `async/await params` (Next.js 16)
- `useTransition` for inline actions (not `isPending` on form)
- `.bind(null, id)` for RSC→Client Server Action passing
- `router.refresh()` after mutation (not `revalidatePath`)
- `form.setValue(..., { shouldValidate: true })` for media picker

### ✗ Gotchas to Avoid
1. **Don't use `form.getValues()` for reactive limits** → `fields.length` instead
2. **Don't convert { url } in form** → Zod schema handles validation
3. **Don't duplicate `<ActionDropdown>` implementations** → Use `*ActionCell`
4. **Don't manually navigate after form success** → use `onSuccess` callback
5. **Don't forget `.bind(null, id)` when passing Server Action to 'use client'**

---

## 13. SUMMARY TABLE

| Aspect | Pattern | Files | Lines |
|--------|---------|-------|-------|
| List Page | Async + Suspense boundaries | customers/page.tsx | 77 |
| Detail Page | AdminDetailLayout + Client comp | customers/[id]/page.tsx | 64 |
| Edit Page | AdminDetailLayout + form | customers/[id]/edit/page.tsx | (in form) |
| Create Page | AdminDetailLayout + form | customers/new/page.tsx | 19 |
| Form (Simple) | useFormAction + RHF | CustomerForm | 237 |
| Form (Complex) | useFormAction + useFieldArray + dnd | LocationForm | 526 |
| Action Cell | ActionDropdown + 2 items | *ActionCell | 31-32 |
| Detail Component | Client + useTransition + inline actions | CustomerDetail | 289 |
| Admin Layout | Header wrapper | AdminDetailLayout | (shared) |

