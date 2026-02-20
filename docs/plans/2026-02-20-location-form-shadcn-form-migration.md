# LocationForm shadcn/ui Form 移行 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** LocationForm の raw `register` パターンを shadcn/ui Form（FormField + FormControl + FormMessage）に移行し、アクセシビリティと一貫性を向上させる。

**Architecture:** `form.tsx`（shadcn/ui Form、React 19 adapted）を新規作成し、`LocationForm.tsx` の全フィールドを `FormField + FormControl + FormMessage` に移行する。`imageUrls`（dnd-kit useState）は React Hook Form 外に置いたまま維持。`locations/new/page.tsx` の旧手動ヘッダーも同時に `AdminDetailLayout` へ修正する。

**Tech Stack:** React 19, React Hook Form 7.x, Zod 4, shadcn/ui, @radix-ui/react-slot（インストール済み）, @radix-ui/react-label（インストール済み）

---

## 背景・コンテキスト

### 現状の問題

`LocationForm.tsx`（508行）は raw `register` パターンを使用:

- 手動 `aria-invalid` / `aria-describedby` が全フィールドに散在（8箇所）
- `<p className="text-xs text-destructive">` による手動エラー表示（6箇所）
- `useWatch` で `isPublished` と `imageUrl` を監視（FormField render で代替可能）
- `<Label htmlFor="...">` の手動 ID 管理

### 移行後の目標

- `FormField + FormControl + FormMessage` による自動 aria 管理
- エラー表示は `<FormMessage />` に統一（設計書ルール準拠）
- `useWatch` を完全削除（FormField render prop 内の `field.value` で代替）

### 重要な前提知識

- `Form` = react-hook-form の `FormProvider`（re-export）
- `FormField` = `Controller` ラッパー + `FormFieldContext` 提供
- `FormControl` = `@radix-ui/react-slot` の `Slot`（子要素に aria 属性をマージ）
- `imageUrls`（追加画像）は `useState` + dnd-kit 管理のため RHF 外のまま維持
- `form.setValue` は FormProvider 内でも正常動作（media picker から呼び出し可能）

### 対象ファイル

| ファイル                                                                   | 操作                    |
| -------------------------------------------------------------------------- | ----------------------- |
| `src/app/(admin)/admin/(dashboard)/_shared/components/ui/form.tsx`         | 新規作成                |
| `src/app/(admin)/admin/(dashboard)/_shared/components/ui/index.ts`         | Form コンポーネント追加 |
| `src/app/(admin)/admin/(dashboard)/locations/_components/LocationForm.tsx` | 移行（508行 → 約400行） |
| `src/app/(admin)/admin/(dashboard)/locations/new/page.tsx`                 | AdminDetailLayout 適用  |

---

## Task 1: form.tsx 新規作成（React 19 adapted）

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/ui/form.tsx`

### 完全なコード

```tsx
"use client";

import type { ComponentPropsWithRef } from "react";
import { createContext, use, useId } from "react";
import {
  Controller,
  FormProvider,
  useFormContext,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/shared/lib/utils";
import { Label } from "@/admin/components/ui/label";

// =============================================================================
// Form（FormProvider の re-export）
// =============================================================================

const Form = FormProvider;

// =============================================================================
// FormField（Controller + FormFieldContext）
// =============================================================================

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName;
};

const FormFieldContext = createContext<FormFieldContextValue | undefined>(
  undefined,
);

function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ ...props }: ControllerProps<TFieldValues, TName>) {
  return (
    <FormFieldContext value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext>
  );
}

// =============================================================================
// FormItem（useId によるIDコンテキスト）
// =============================================================================

type FormItemContextValue = {
  id: string;
};

const FormItemContext = createContext<FormItemContextValue | undefined>(
  undefined,
);

function FormItem({ ref, className, ...props }: ComponentPropsWithRef<"div">) {
  const id = useId();
  return (
    <FormItemContext value={{ id }}>
      <div ref={ref} className={cn("space-y-2", className)} {...props} />
    </FormItemContext>
  );
}

// =============================================================================
// useFormField（FormField + FormItem コンテキストの統合取得）
// =============================================================================

function useFormField() {
  const fieldContext = use(FormFieldContext);
  const itemContext = use(FormItemContext);
  const { getFieldState, formState } = useFormContext();

  if (!fieldContext) {
    throw new Error("useFormField should be used within <FormField>");
  }

  const fieldState = getFieldState(fieldContext.name, formState);
  const id = itemContext?.id ?? "";

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
}

// =============================================================================
// FormLabel（エラー時 text-destructive + 自動 htmlFor）
// =============================================================================

function FormLabel({
  ref,
  className,
  ...props
}: ComponentPropsWithRef<typeof Label>) {
  const { error, formItemId } = useFormField();
  return (
    <Label
      ref={ref}
      className={cn(error && "text-destructive", className)}
      htmlFor={formItemId}
      {...props}
    />
  );
}

// =============================================================================
// FormControl（Slot で子要素に aria 属性をマージ）
// =============================================================================

function FormControl({ ref, ...props }: ComponentPropsWithRef<typeof Slot>) {
  const { error, formItemId, formDescriptionId, formMessageId } =
    useFormField();
  return (
    <Slot
      ref={ref}
      id={formItemId}
      aria-describedby={
        !error ? formDescriptionId : `${formDescriptionId} ${formMessageId}`
      }
      aria-invalid={!!error}
      {...props}
    />
  );
}

// =============================================================================
// FormDescription（ヒントテキスト）
// =============================================================================

function FormDescription({
  ref,
  className,
  ...props
}: ComponentPropsWithRef<"p">) {
  const { formDescriptionId } = useFormField();
  return (
    <p
      ref={ref}
      id={formDescriptionId}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

// =============================================================================
// FormMessage（エラーメッセージ）
// =============================================================================

function FormMessage({
  ref,
  className,
  children,
  ...props
}: ComponentPropsWithRef<"p">) {
  const { error, formMessageId } = useFormField();
  const body = error ? String(error?.message ?? "") : children;

  if (!body) return null;

  return (
    <p
      ref={ref}
      id={formMessageId}
      className={cn("text-xs text-destructive", className)}
      {...props}
    >
      {body}
    </p>
  );
}

// =============================================================================
// Exports
// =============================================================================

export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormField,
  FormControl,
  FormDescription,
  FormMessage,
};
```

### 確認コマンド

```bash
bun run type-check
```

Expected: エラーなし（form.tsx 単体の型チェック）

### Commit

```bash
git add 'src/app/(admin)/admin/(dashboard)/_shared/components/ui/form.tsx'
git commit -m "feat(admin/ui): add shadcn/ui Form components (React 19 adapted)"
```

---

## Task 2: ui/index.ts バレルへ Form エクスポート追加

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/ui/index.ts`（末尾に追加）

### 追加するコード

`index.ts` の末尾（`// CharCount` のエクスポートの後）に追加:

```typescript
// Form
export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormField,
  FormControl,
  FormDescription,
  FormMessage,
} from "./form";
```

### 確認コマンド

```bash
bun run type-check
```

Expected: エラーなし

### Commit

```bash
git add 'src/app/(admin)/admin/(dashboard)/_shared/components/ui/index.ts'
git commit -m "feat(admin/ui): export Form components from ui barrel"
```

---

## Task 3: LocationForm.tsx を shadcn/ui Form に完全移行

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/locations/_components/LocationForm.tsx`

### 移行の要点

**削除するもの:**

- `import { Label }` → `FormLabel` に置き換え（`Label` は不要）
- `useWatch` の2箇所（`isPublished`, `imageUrl`）→ FormField `render` 内の `field.value` で代替
- 全フィールドの `aria-invalid={!!errors.xxx}` / `aria-describedby` 手動記述
- 全フィールドの `<p className="text-xs text-destructive">` エラー表示
- `register` の使用箇所（FormField render に移行）

**残すもの:**

- `useState<string[]>` for `imageUrls`（dnd-kit 管理、RHF 外）
- `useSingleMediaPicker` / `useMultipleMediaPicker`（media picker hooks）
- `useTransition` / `startTransition`（async submit）
- `useId` for DndContext（SSR 対応）
- dnd-kit 全体（DndContext, SortableContext, useSortable, arrayMove 等）
- `DragHandle`, `SortableImageItem` サブコンポーネント（変更なし）
- `form.setValue`（media picker の onSelect コールバックで使用）

### 完全な移行後コード

```tsx
"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition, useId } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ImagePlus } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Switch,
  Textarea,
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
  CSS,
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  type DragEndEvent,
} from "@/admin/components/ui";
import {
  locationFormSchema,
  defaultLocationFormValues,
  type LocationFormInput,
  type LocationWithStats,
} from "@/admin/lib/validations/location";
import { createLocation, updateLocation } from "@/admin/actions/location";
import { cn } from "@/shared/lib/utils";
import {
  useSingleMediaPicker,
  useMultipleMediaPicker,
} from "@/admin/hooks/use-media-picker";

type LocationFormProps = {
  location?: LocationWithStats;
  mode: "create" | "edit";
};

// =============================================================================
// Drag Handle
// =============================================================================

function DragHandle({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-8 w-8 cursor-grab items-center justify-center rounded text-muted-foreground transition-colors",
        "hover:bg-muted hover:text-foreground",
        "active:cursor-grabbing",
        className,
      )}
      aria-label="ドラッグして並び替え"
    >
      <svg
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path
          d="M4 8h16M4 16h16"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

// =============================================================================
// Sortable Image Item
// =============================================================================

type SortableImageItemProps = {
  id: string;
  url: string;
  index: number;
  onRemove: (index: number) => void;
  disabled?: boolean;
};

function SortableImageItem({
  id,
  url,
  index,
  onRemove,
  disabled,
}: SortableImageItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded border p-2",
        isDragging && "z-50 bg-muted/80 shadow-lg",
      )}
    >
      <div {...attributes} {...listeners}>
        <DragHandle />
      </div>
      <Image
        src={url}
        alt={`画像${index + 1}`}
        width={40}
        height={40}
        className="rounded object-cover"
        style={{ width: 40, height: 40 }}
      />
      <span className="flex-1 truncate text-sm">{url}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onRemove(index)}
        disabled={disabled}
      >
        削除
      </Button>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function LocationForm({ location, mode }: LocationFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [imageUrls, setImageUrls] = useState<string[]>(
    location?.imageUrls || [],
  );
  // SSR対応のDndContext ID（hydration mismatch防止）
  const dndContextId = useId();

  const form = useForm<LocationFormInput>({
    resolver: zodResolver(locationFormSchema),
    defaultValues: location
      ? {
          name: location.name,
          description: location.description || "",
          address: location.address,
          access: location.access || "",
          imageUrl: location.imageUrl,
          imageUrls: location.imageUrls,
          businessHours: location.businessHours,
          sortOrder: location.sortOrder,
          isPublished: location.isPublished,
        }
      : defaultLocationFormValues,
  });

  // メイン画像用メディアピッカー（単一選択）
  const mainImagePicker = useSingleMediaPicker({
    defaultUsage: "SPACE",
    onSelect: (media) => {
      const selected = media[0];
      if (selected) {
        form.setValue("imageUrl", selected.url, { shouldValidate: true });
      }
    },
  });

  // 追加画像用メディアピッカー（複数選択）
  const additionalImagesPicker = useMultipleMediaPicker({
    defaultUsage: "SPACE",
    maxSelections: 10 - imageUrls.length,
    onSelect: (media) => {
      if (media.length > 0) {
        const newUrls = media.map((m) => m.url);
        setImageUrls((prev) => [...prev, ...newUrls].slice(0, 10));
      }
    },
  });

  // D&D Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const onSubmit = async (data: LocationFormInput) => {
    startTransition(async () => {
      const submitData = {
        name: data.name,
        description: data.description || "",
        address: data.address,
        access: data.access || "",
        imageUrl: data.imageUrl,
        imageUrls,
        businessHours: data.businessHours,
        sortOrder: data.sortOrder,
        isPublished: data.isPublished ?? false,
      };

      if (mode === "create") {
        const result = await createLocation(submitData);
        if (result.success) {
          router.push(`/admin/locations/${result.data.id}`);
        } else {
          toast.error(result.error);
        }
      } else if (location) {
        const result = await updateLocation(location.id, submitData);
        if (result.success) {
          router.push("/admin/locations");
        } else {
          toast.error(result.error);
        }
      }
    });
  };

  const removeImageUrl = (index: number) => {
    setImageUrls(imageUrls.filter((_, i) => i !== index));
  };

  const handleImageDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = imageUrls.findIndex((_, i) => `image-${i}` === active.id);
    const newIndex = imageUrls.findIndex((_, i) => `image-${i}` === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    setImageUrls(arrayMove(imageUrls, oldIndex, newIndex));
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* 基本情報 */}
        <Card>
          <CardHeader>
            <CardTitle>基本情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    場所名 <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="例: Myrrhビル"
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>説明</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="建物・施設の説明を入力..."
                      rows={4}
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    住所 <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="例: 東京都渋谷区..."
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="access"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>アクセス</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder={`例: 渋谷駅から徒歩5分\n地下鉄A出口すぐ`}
                      rows={3}
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sortOrder"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>並び順</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      onChange={(e) => field.onChange(e.target.valueAsNumber)}
                      placeholder="0"
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormDescription>
                    数値が小さいほど先頭に表示されます
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* 画像設定 */}
        <Card>
          <CardHeader>
            <CardTitle>画像設定</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* メイン画像 */}
            <FormField
              control={form.control}
              name="imageUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    建物画像 <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <div className="flex items-start gap-4">
                      {field.value ? (
                        <div className="relative h-24 w-24 overflow-hidden rounded-lg border">
                          <Image
                            src={field.value}
                            alt="建物画像"
                            fill
                            sizes="96px"
                            className="object-cover"
                          />
                        </div>
                      ) : (
                        <div className="flex h-24 w-24 items-center justify-center rounded-lg border border-dashed bg-muted">
                          <ImagePlus className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 space-y-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => mainImagePicker.openPicker()}
                          disabled={isPending}
                        >
                          <ImagePlus className="mr-2 h-4 w-4" />
                          画像を選択
                        </Button>
                        {field.value && (
                          <p className="truncate text-sm text-muted-foreground">
                            {field.value}
                          </p>
                        )}
                      </div>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 追加画像（imageUrls は useState 管理、RHF 外） */}
            <div className="space-y-2">
              <p className="text-sm font-medium leading-none">
                追加画像（最大10枚）
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => additionalImagesPicker.openPicker()}
                disabled={isPending || imageUrls.length >= 10}
              >
                <ImagePlus className="mr-2 h-4 w-4" />
                画像を追加
              </Button>
              {imageUrls.length > 0 && (
                <>
                  <p className="text-sm text-muted-foreground">
                    {imageUrls.length} / 10 枚選択中 ・
                    ドラッグ&ドロップで順序を変更できます
                  </p>
                  <DndContext
                    id={dndContextId}
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleImageDragEnd}
                  >
                    <SortableContext
                      items={imageUrls.map((_, i) => `image-${i}`)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="mt-2 space-y-2">
                        {imageUrls.map((url, index) => (
                          <SortableImageItem
                            key={`image-${index}`}
                            id={`image-${index}`}
                            url={url}
                            index={index}
                            onRemove={removeImageUrl}
                            disabled={isPending}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 公開設定 */}
        <Card>
          <CardHeader>
            <CardTitle>公開設定</CardTitle>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="isPublished"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-4">
                  <FormControl>
                    <Switch
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                      disabled={isPending}
                    />
                  </FormControl>
                  <div>
                    <FormLabel className="text-base font-medium">
                      {field.value ? "公開中" : "非公開"}
                    </FormLabel>
                    <FormDescription>
                      {field.value
                        ? "この場所は公開ページに表示されます"
                        : "この場所は公開ページに表示されません"}
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* ボタン */}
        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={isPending}
          >
            キャンセル
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending
              ? mode === "create"
                ? "作成中..."
                : "更新中..."
              : mode === "create"
                ? "作成"
                : "更新"}
          </Button>
        </div>

        {/* メディアピッカーダイアログ */}
        <mainImagePicker.MediaPicker />
        <additionalImagesPicker.MediaPicker />
      </form>
    </Form>
  );
}
```

### 注意点

1. **`useWatch` は不要**: `isPublished` と `imageUrl` は FormField の `render` 内 `field.value` で取得
2. **`imageUrl` の FormControl**: `<div>` を Slot でラップ → `aria-invalid` が div に付く（カスタムコントロールとして適切）
3. **`isPublished` の FormLabel**: `htmlFor` は自動設定されるが Switch は label では制御されない。`FormItem` を `flex` レイアウトにして Switch の隣に FormLabel を配置
4. **`sortOrder`**: `onChange={(e) => field.onChange(e.target.valueAsNumber)}` でnum変換（`valueAsNumber` は NaN を返す可能性あり → スキーマで適切に定義済みであること前提）
5. **追加画像セクション**: `imageUrls` は RHF 外なので `FormField` を使わず `<div className="space-y-2">` + `<p>` でラベル表示

### 確認コマンド

```bash
bun run type-check
```

Expected: エラーなし

### Commit

```bash
git add 'src/app/(admin)/admin/(dashboard)/locations/_components/LocationForm.tsx'
git commit -m "refactor(locations): migrate LocationForm to shadcn/ui Form pattern"
```

---

## Task 4: locations/new/page.tsx を AdminDetailLayout に修正

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/locations/new/page.tsx`

### 現状（修正前）

```tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LocationForm } from "../_components/LocationForm";
import { Button } from "@/admin/components/ui";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "場所新規作成 | Myrrh Rental Space",
};

export default function NewLocationPage() {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/locations">
            <ArrowLeft className="mr-2 h-4 w-4" />
            一覧に戻る
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">場所新規作成</h1>
          <p className="text-muted-foreground">
            新しい場所（建物・施設）を作成します
          </p>
        </div>
      </div>
      {/* フォーム */}
      <LocationForm mode="create" />
    </div>
  );
}
```

### 修正後コード

```tsx
import { LocationForm } from "../_components/LocationForm";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "場所新規作成 | Myrrh Rental Space",
};

export default function NewLocationPage() {
  return (
    <AdminDetailLayout
      backHref="/admin/locations"
      title="場所新規作成"
      subtitle="新しい場所（建物・施設）を作成します"
    >
      <LocationForm mode="create" />
    </AdminDetailLayout>
  );
}
```

**注意**: `NewLocationPage` は静的コンポーネント（データ取得なし）のため `connection()` は不要。`AdminDetailLayout` は Server Component なので `'use client'` 不要。

### 確認コマンド

```bash
bun run type-check
```

Expected: エラーなし

### Commit

```bash
git add 'src/app/(admin)/admin/(dashboard)/locations/new/page.tsx'
git commit -m "fix(locations): apply AdminDetailLayout to new location page"
```

---

## Task 5: 最終検証

### 検証コマンド

```bash
bun run validate && bun run build
```

Expected:

- `bun run validate`（type-check + lint 並列）: エラーなし
- `bun run build`: ビルド成功、エラーなし

### 確認ポイント

- [ ] `form.tsx` の型エラーなし（`ComponentPropsWithRef<typeof Slot>` の互換性）
- [ ] `LocationForm.tsx` の型エラーなし（`field.onChange` の型が `sortOrder` の `valueAsNumber` と一致）
- [ ] `locations/new/page.tsx` の型エラーなし
- [ ] lint エラーなし（`useWatch` 削除後の不要 import がないこと）
- [ ] ビルド成功（PPR エラーなし）

### 型エラー対処

**`sortOrder` の valueAsNumber**: `e.target.valueAsNumber` は `number`。`locationFormSchema` の `sortOrder` が `z.number()` であれば型一致。`z.coerce.number()` や `z.number().optional()` でも OK。

**`FormControl` と `Slot` の ref 型**: `ComponentPropsWithRef<typeof Slot>` は `React.ComponentPropsWithRef<typeof Slot>` と等価。`@radix-ui/react-slot` の型定義に依存するが、プロジェクトには `"@radix-ui/react-slot": "^1.2.4"` インストール済み。

---

## 設計書リンク

- 設計書: `docs/plans/2026-02-20-location-form-shadcn-form-migration-design.md`
- 関連ルール: `.claude/rules/frontend/admin-ui-patterns.md`（フォームエラー: `<FormMessage />` のみ）
- 参考: `.claude/rules/react-patterns.md`（React 19 forwardRef 廃止、useWatch パターン）
