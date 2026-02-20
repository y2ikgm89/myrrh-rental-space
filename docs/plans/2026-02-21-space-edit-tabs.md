# SpaceEditForm タブ実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** SpaceEditForm の単一スクロールレイアウトを nuqs URL タブ（5タブ）に置き換え、`forceMount` で全フィールド常時マウント維持 + タブヘッダーにエラーバッジを表示する。

**Architecture:** Radix `TabsContent` の `forceMount` prop で全タブコンテンツを常時 DOM に存在させ、非アクティブタブは CSS `display:none`（既存の `data-[state=inactive]:hidden`）で隠す。これにより RHF が全フィールドを常に認識してバリデーションが正しく動く。nuqs `useQueryState` でタブ状態を URL クエリパラメータ（`?tab=basic`）に保存し、リロード・ブックマークに対応。単一 `<form>` と save ボタン（スティッキーバー）は維持する。

**Tech Stack:** React Hook Form, nuqs 2.x, Radix UI Tabs (`@radix-ui/react-tabs`), Zod 4, `@/admin/components/ui` の Tabs コンポーネント

---

## 実装の前提知識

### `TabsContent forceMount` の動作

```tsx
// forceMount=true: 全タブが常に DOM に存在。非アクティブは data-[state=inactive] → hidden
// forceMount なし（デフォルト）: 非アクティブタブはアンマウントされ RHF がフィールドを見失う
<TabsContent value="basic" forceMount>
  {/* このコンテンツは常に DOM 上に存在 */}
</TabsContent>
```

既存の `TabsContent` コンポーネント（`src/app/(admin)/admin/(dashboard)/_shared/components/ui/tabs.tsx`）は `data-[state=inactive]:hidden` を適用済みのため、`forceMount` を付けるだけで隠れる動作が自動的に機能する。

### nuqs `parseAsStringLiteral` パターン

```typescript
import { useQueryState, parseAsStringLiteral } from "nuqs";

const TAB_VALUES = [
  "basic",
  "pricing",
  "media",
  "details",
  "publish",
] satisfies [string, ...string[]];

const [activeTab, setActiveTab] = useQueryState(
  "tab",
  parseAsStringLiteral(TAB_VALUES).withDefault("basic"),
);
// activeTab の型: 'basic' | 'pricing' | 'media' | 'details' | 'publish'
// setActiveTab は Promise<void> を返す → void でラップする
```

### タブ構成（5タブ）

| タブ値    | ラベル    | 含むフィールド                                                                                 |
| --------- | --------- | ---------------------------------------------------------------------------------------------- |
| `basic`   | 基本情報  | name, slug, description, address, access, capacity, area                                       |
| `pricing` | 料金設定  | hourlyPrice, dailyPrice, discountType, discountValue, durationDiscountOverride, taxRateType    |
| `media`   | メディア  | mainImageUrl, imageUrls                                                                        |
| `details` | 詳細設定  | locationId, categoryId, facilities, termsId                                                    |
| `publish` | 公開・SEO | isPublished, publishedAt, metaDescription, metaKeywords, ogpTitle, ogpDescription, ogpImageUrl |

---

## Task 1: SpaceEditForm.tsx — タブ実装

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceEditForm.tsx`

### Step 1: インポートを更新

ファイル冒頭のインポートを以下に更新する。

```tsx
"use client";

import Image from "next/image";
import {
  useState,
  useEffect,
  useTransition,
  useId,
  useEffectEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  useForm,
  useWatch,
  useFieldArray,
  type FieldErrors,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ImagePlus, GripVertical, HelpCircle, X } from "lucide-react";
import { useQueryState, parseAsStringLiteral } from "nuqs";
import {
  Button,
  Input,
  Label,
  Textarea,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
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
  CSS,
  type DragEndEvent,
} from "@/admin/components/ui";
```

（既存の `import dynamic from "next/dynamic"` は削除済みのため追加不要）

### Step 2: タブ定数・ヘルパーを追加

`const SELECT_NONE_VALUE = "__none__";` の直下、`const formSchema = z.object({...` の上に追加する。

```tsx
// =============================================================================
// Tab constants
// =============================================================================
const TAB_VALUES = [
  "basic",
  "pricing",
  "media",
  "details",
  "publish",
] satisfies [string, ...string[]];
type TabValue = (typeof TAB_VALUES)[number];

const TAB_LABELS: Record<TabValue, string> = {
  basic: "基本情報",
  pricing: "料金設定",
  media: "メディア",
  details: "詳細設定",
  publish: "公開・SEO",
};

const TAB_FIELDS: Record<TabValue, (keyof FormData)[]> = {
  basic: [
    "name",
    "slug",
    "description",
    "address",
    "access",
    "capacity",
    "area",
  ],
  pricing: [
    "hourlyPrice",
    "dailyPrice",
    "discountType",
    "discountValue",
    "durationDiscountOverride",
    "taxRateType",
  ],
  media: ["mainImageUrl", "imageUrls"],
  details: ["locationId", "categoryId", "facilities", "termsId"],
  publish: [
    "isPublished",
    "publishedAt",
    "metaDescription",
    "metaKeywords",
    "ogpTitle",
    "ogpDescription",
    "ogpImageUrl",
  ],
};

function getTabErrorCount(
  errors: FieldErrors<FormData>,
  tab: TabValue,
): number {
  return TAB_FIELDS[tab].filter((field) => !!errors[field]).length;
}
```

**注意**: `FormData` 型は `formSchema` の下で定義されるため、`TAB_FIELDS` の型注釈 `(keyof FormData)[]` はファイル内で `FormData` が定義された後に使うことになる。TypeScript はホイスティングしないが、定数は実行時に評価されるため問題ない。

### Step 3: コンポーネント内に nuqs state を追加

`SpaceEditForm` コンポーネント内、`const router = useRouter();` の直下に追加する。

```tsx
const [activeTab, setActiveTab] = useQueryState(
  "tab",
  parseAsStringLiteral(TAB_VALUES).withDefault("basic"),
);
```

### Step 4: `formState` から `errors` を取得（既存コード確認）

既存コードの以下の行を確認：

```tsx
const {
  register,
  handleSubmit,
  control,
  setValue,
  getValues,
  formState: { errors, isDirty },
} = form;
```

`errors` は既に取得されているため変更不要。

### Step 5: return JSX 全体をタブ構造に置き換え

現在の `return (...)` 全体を以下で置き換える。各タブの中身は既存の JSX をカット&ペーストで配置する。**カードのネスト構造・className は一切変更しない。**

```tsx
return (
  <form onSubmit={handleSubmit(onSubmit)}>
    <Tabs
      value={activeTab}
      onValueChange={(v) => void setActiveTab(v)}
      className="space-y-4"
    >
      {/* ── タブナビゲーション ── */}
      <TabsList className="flex-wrap h-auto gap-1">
        {TAB_VALUES.map((tab) => {
          const errorCount = getTabErrorCount(errors, tab);
          return (
            <TabsTrigger
              key={tab}
              value={tab}
              className="flex items-center gap-1.5"
            >
              {TAB_LABELS[tab]}
              {errorCount > 0 && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
                  {errorCount}
                </span>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>

      {/* ══ Tab: 基本情報 ══ */}
      <TabsContent value="basic" forceMount>
        <Card>
          <CardHeader>
            <CardTitle>基本情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* スペース名 */}
            <div className="space-y-2">
              <Label htmlFor="name">スペース名 *</Label>
              <Input
                id="name"
                {...register("name")}
                placeholder="例: 会議室A"
                disabled={isPending}
              />
              {errors.name && (
                <p className="text-sm text-destructive">
                  {errors.name.message}
                </p>
              )}
            </div>

            {/* スラッグ */}
            <div className="space-y-2">
              <Label htmlFor="slug">スラッグ *</Label>
              <Input
                id="slug"
                {...register("slug")}
                placeholder="例: meeting-room-a"
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                URLに使用されます（小文字英数字とハイフンのみ）
              </p>
              {errors.slug && (
                <p className="text-sm text-destructive">
                  {errors.slug.message}
                </p>
              )}
            </div>

            {/* 説明 */}
            <div className="space-y-2">
              <Label htmlFor="description">説明 *</Label>
              <Textarea
                id="description"
                {...register("description")}
                placeholder="スペースの説明を入力..."
                rows={6}
                disabled={isPending}
              />
              {errors.description && (
                <p className="text-sm text-destructive">
                  {errors.description.message}
                </p>
              )}
            </div>

            {/* 住所・アクセス */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="address">住所 *</Label>
                <Input
                  id="address"
                  {...register("address")}
                  placeholder="例: 東京都渋谷区..."
                  disabled={isPending}
                />
                {errors.address && (
                  <p className="text-sm text-destructive">
                    {errors.address.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="access">アクセス</Label>
                <Input
                  id="access"
                  {...register("access")}
                  placeholder="例: 渋谷駅から徒歩5分"
                  disabled={isPending}
                />
              </div>
            </div>

            {/* 定員・面積 */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="capacity">定員（人数）*</Label>
                <Input
                  id="capacity"
                  type="number"
                  {...register("capacity", { valueAsNumber: true })}
                  placeholder="10"
                  disabled={isPending}
                />
                {errors.capacity && (
                  <p className="text-sm text-destructive">
                    {errors.capacity.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="area">面積（m²）</Label>
                <Input
                  id="area"
                  type="number"
                  step="0.01"
                  {...register("area", {
                    setValueAs: (v: string) => (v === "" ? null : Number(v)),
                  })}
                  placeholder="50"
                  disabled={isPending}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ══ Tab: 料金設定 ══ */}
      <TabsContent value="pricing" forceMount>
        <Card>
          <CardHeader>
            <CardTitle>料金設定</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 基本料金 */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="hourlyPrice">時間料金（円/時間）*</Label>
                <Input
                  id="hourlyPrice"
                  type="number"
                  {...register("hourlyPrice", { valueAsNumber: true })}
                  placeholder="5000"
                  disabled={isPending}
                />
                {errors.hourlyPrice && (
                  <p className="text-sm text-destructive">
                    {errors.hourlyPrice.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="dailyPrice">日額料金（円/日）</Label>
                <Input
                  id="dailyPrice"
                  type="number"
                  {...register("dailyPrice", {
                    setValueAs: (v: string) => (v === "" ? null : Number(v)),
                  })}
                  placeholder="30000"
                  disabled={isPending}
                />
              </div>
            </div>

            {/* 割引設定 */}
            <div className="space-y-4 pt-4 border-t">
              <h4 className="text-sm font-medium text-muted-foreground">
                割引設定
              </h4>

              {/* 固定割引 */}
              <div className="space-y-2">
                <Label htmlFor="discountType" className="text-sm font-medium">
                  固定割引
                </Label>
                <div className="flex flex-wrap items-center gap-3">
                  <Select
                    value={discountType}
                    onValueChange={(value) => {
                      const validated = getValidDiscountType(
                        value,
                        DiscountType.none,
                      );
                      setValue("discountType", validated, {
                        shouldDirty: true,
                      });
                    }}
                    disabled={isPending}
                  >
                    <SelectTrigger id="discountType" className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={DiscountType.none}>なし</SelectItem>
                      <SelectItem value={DiscountType.percentage}>
                        パーセント割引
                      </SelectItem>
                      <SelectItem value={DiscountType.fixed}>
                        定額割引
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {discountType === DiscountType.percentage && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        {...register("discountValue", {
                          setValueAs: (v: string) =>
                            v === "" ? null : Number(v),
                        })}
                        placeholder="10"
                        className="w-20"
                        disabled={isPending}
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  )}
                  {discountType === DiscountType.fixed && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        {...register("discountValue", {
                          setValueAs: (v: string) =>
                            v === "" ? null : Number(v),
                        })}
                        placeholder="500"
                        className="w-24"
                        disabled={isPending}
                      />
                      <span className="text-sm text-muted-foreground">円</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 長時間割引 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor="durationDiscountOverride"
                    className="text-sm font-medium"
                  >
                    長時間割引
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>
                          グローバル設定の長時間割引をスペース単位で上書きできます。
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Select
                  value={durationDiscountOverride}
                  onValueChange={(value) => {
                    const validated = getValidDurationDiscountOverride(
                      value,
                      DurationDiscountOverride.inherit,
                    );
                    setValue("durationDiscountOverride", validated, {
                      shouldDirty: true,
                    });
                  }}
                  disabled={isPending}
                >
                  <SelectTrigger id="durationDiscountOverride">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DurationDiscountOverride.inherit}>
                      グローバル設定に従う
                    </SelectItem>
                    <SelectItem value={DurationDiscountOverride.enabled}>
                      このスペースは常に有効
                    </SelectItem>
                    <SelectItem value={DurationDiscountOverride.disabled}>
                      このスペースは無効
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 税率設定 */}
            <div className="space-y-2 pt-4 border-t">
              <h4 className="text-sm font-medium text-muted-foreground">
                税率設定
              </h4>
              <Select
                value={taxRateType}
                onValueChange={(value) => {
                  const validated = getValidTaxRateType(value);
                  setValue("taxRateType", validated, { shouldDirty: true });
                }}
                disabled={isPending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TaxRateType.standard}>
                    標準税率（{taxSettings.standardRate}%）
                  </SelectItem>
                  <SelectItem value={TaxRateType.reduced}>
                    軽減税率（{taxSettings.reducedRate}%）
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 料金プレビュー */}
            {hourlyPrice > 0 && (
              <div className="pt-4 border-t">
                <h4 className="text-sm font-medium text-muted-foreground mb-3">
                  料金プレビュー
                  <span className="font-normal ml-2">
                    （{getTaxRateLabel(taxRateType, currentTaxRate)}）
                  </span>
                </h4>
                <div className="rounded-lg bg-muted/50 p-4 space-y-3">
                  {/* 時間料金 */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm">時間料金</span>
                    <div className="text-right space-y-0.5">
                      {hasDiscount && (
                        <div className="text-xs text-muted-foreground line-through">
                          ¥{hourlyPrice.toLocaleString()}（税抜）
                        </div>
                      )}
                      <div className="text-sm">
                        ¥
                        {(hasDiscount
                          ? discountedHourlyPrice
                          : hourlyPrice
                        ).toLocaleString()}
                        （税抜）
                      </div>
                      <div className="text-sm font-semibold text-primary">
                        ¥
                        {(hasDiscount
                          ? discountedTaxIncludedHourlyPrice
                          : taxIncludedHourlyPrice
                        ).toLocaleString()}
                        （税込）
                      </div>
                    </div>
                  </div>
                  {/* 日額料金 */}
                  {dailyPrice && (
                    <div className="flex items-center justify-between pt-2 border-t border-border/50">
                      <span className="text-sm">日額料金</span>
                      <div className="text-right space-y-0.5">
                        {hasDiscount && discountedDailyPrice !== null && (
                          <div className="text-xs text-muted-foreground line-through">
                            ¥{dailyPrice.toLocaleString()}（税抜）
                          </div>
                        )}
                        <div className="text-sm">
                          ¥
                          {(hasDiscount && discountedDailyPrice !== null
                            ? discountedDailyPrice
                            : dailyPrice
                          ).toLocaleString()}
                          （税抜）
                        </div>
                        <div className="text-sm font-semibold text-primary">
                          ¥
                          {(
                            discountedTaxIncludedDailyPrice ??
                            taxIncludedDailyPrice ??
                            0
                          ).toLocaleString()}
                          （税込）
                        </div>
                      </div>
                    </div>
                  )}
                  {hasDiscount && (
                    <p className="text-xs text-muted-foreground pt-2 border-t border-border/50">
                      割引:{" "}
                      {discountType === DiscountType.percentage
                        ? `${discountValue}% OFF`
                        : `¥${discountValue?.toLocaleString()}引`}
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* ══ Tab: メディア ══ */}
      <TabsContent value="media" forceMount>
        <Card>
          <CardHeader>
            <CardTitle>画像設定</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* メイン画像 */}
            <div className="space-y-2">
              <Label>メイン画像 *</Label>
              <div className="flex items-start gap-4">
                {mainImageUrl ? (
                  <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border">
                    <Image
                      src={mainImageUrl}
                      alt="メイン画像"
                      fill
                      sizes="96px"
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg border border-dashed bg-muted">
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
                  {mainImageUrl && (
                    <p className="truncate text-xs text-muted-foreground">
                      {mainImageUrl}
                    </p>
                  )}
                </div>
              </div>
              {errors.mainImageUrl && (
                <p className="text-sm text-destructive">
                  {errors.mainImageUrl.message}
                </p>
              )}
            </div>

            {/* 追加画像（useFieldArray + dnd-kit）*/}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>追加画像（最大10枚）</Label>
                <span className="text-sm text-muted-foreground">
                  {imageFields.length} / 10 枚
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => additionalImagesPicker.openPicker()}
                disabled={isPending || imageFields.length >= 10}
              >
                <ImagePlus className="mr-2 h-4 w-4" />
                画像を追加
              </Button>
              {imageFields.length > 0 && (
                <>
                  <p className="text-xs text-muted-foreground">
                    ドラッグ&ドロップで順序を変更できます
                  </p>
                  <DndContext
                    id={dndContextId}
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleImageDragEnd}
                  >
                    <SortableContext
                      items={imageFields.map((f) => f.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        {imageFields.map((field, index) => (
                          <SortableImageItem
                            key={field.id}
                            id={field.id}
                            url={field.url}
                            index={index}
                            onRemove={removeImage}
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
      </TabsContent>

      {/* ══ Tab: 詳細設定 ══ */}
      <TabsContent value="details" forceMount>
        <div className="space-y-6">
          {/* 場所・カテゴリー */}
          {(availableLocations.length > 0 ||
            availableCategories.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>場所・カテゴリー</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {availableLocations.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="locationId">場所（建物・施設）</Label>
                    <Select
                      value={locationId ?? SELECT_NONE_VALUE}
                      onValueChange={(value) => {
                        setValue(
                          "locationId",
                          value === SELECT_NONE_VALUE ? null : value,
                          { shouldDirty: true },
                        );
                      }}
                      disabled={isPending}
                    >
                      <SelectTrigger id="locationId">
                        <SelectValue placeholder="場所を選択" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SELECT_NONE_VALUE}>
                          指定なし
                        </SelectItem>
                        {availableLocations.map((loc) => (
                          <SelectItem key={loc.id} value={loc.id}>
                            {loc.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {availableCategories.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="categoryId">カテゴリー</Label>
                    <Select
                      value={categoryId ?? SELECT_NONE_VALUE}
                      onValueChange={(value) => {
                        setValue(
                          "categoryId",
                          value === SELECT_NONE_VALUE ? null : value,
                          { shouldDirty: true },
                        );
                      }}
                      disabled={isPending}
                    >
                      <SelectTrigger id="categoryId">
                        <SelectValue placeholder="カテゴリーを選択" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SELECT_NONE_VALUE}>
                          指定なし
                        </SelectItem>
                        {availableCategories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.icon && (
                              <span className="mr-1">{cat.icon}</span>
                            )}
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* 設備・アメニティ */}
          <Card>
            <CardHeader>
              <CardTitle>設備・アメニティ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={newFacility}
                  onChange={(e) => setNewFacility(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addFacility();
                    }
                  }}
                  placeholder="例: Wi-Fi, プロジェクター"
                  disabled={isPending}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addFacility}
                  disabled={isPending}
                >
                  追加
                </Button>
              </div>
              {facilityFields.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {facilityFields.map((field, index) => (
                    <span
                      key={field.id}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1 text-sm"
                    >
                      {field.value}
                      <button
                        type="button"
                        onClick={() => removeFacility(index)}
                        disabled={isPending}
                        className="ml-1 text-muted-foreground hover:text-foreground"
                        aria-label={`${field.value}を削除`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 利用規約 */}
          {availableTerms.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>利用規約</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Label htmlFor="termsId">適用する利用規約</Label>
                <Select
                  value={termsId ?? SELECT_NONE_VALUE}
                  onValueChange={(value) => {
                    setValue(
                      "termsId",
                      value === SELECT_NONE_VALUE ? null : value,
                      { shouldDirty: true },
                    );
                  }}
                  disabled={isPending}
                >
                  <SelectTrigger id="termsId">
                    <SelectValue placeholder="利用規約を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECT_NONE_VALUE}>なし</SelectItem>
                    {availableTerms.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.title}
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({t.type})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          )}
        </div>
      </TabsContent>

      {/* ══ Tab: 公開・SEO ══ */}
      <TabsContent value="publish" forceMount>
        <div className="space-y-6">
          {/* 公開設定 */}
          <Card>
            <CardHeader>
              <CardTitle>公開設定</CardTitle>
            </CardHeader>
            <CardContent>
              <UnifiedPublishFields
                control={control}
                register={register}
                errors={errors}
                isPublished={isPublished}
                disabled={isPending}
              />
            </CardContent>
          </Card>

          {/* SEO・OGP設定 */}
          <Card>
            <CardHeader>
              <CardTitle>SEO・OGP 設定</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <SEOFields
                register={register}
                errors={errors}
                disabled={isPending}
                fields={{
                  metaDescription: "metaDescription",
                  metaKeywords: "metaKeywords",
                }}
              />
              <div className="border-t pt-4">
                <OGPFields
                  register={register}
                  control={control}
                  errors={errors}
                  setValue={setValue}
                  disabled={isPending}
                  fields={{
                    ogpTitle: "ogpTitle",
                    ogpDescription: "ogpDescription",
                    ogpImageUrl: "ogpImageUrl",
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>
    </Tabs>

    {/* ── スティッキー保存バー ── */}
    <div className="sticky bottom-0 z-10 mt-6 -mx-4 border-t bg-background px-4 py-4 md:-mx-6 md:px-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isDirty ? "未保存の変更があります" : ""}
        </p>
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              router.push(
                mode === "edit" && space
                  ? `/admin/spaces/${space.id}`
                  : "/admin/spaces",
              )
            }
            disabled={isPending}
          >
            キャンセル
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending
              ? "保存中..."
              : mode === "create"
                ? "スペースを作成"
                : "変更を保存"}
          </Button>
        </div>
      </div>
    </div>

    {/* メディアピッカーダイアログ */}
    <mainImagePicker.MediaPicker />
    <additionalImagesPicker.MediaPicker />
  </form>
);
```

### Step 6: 削除対象コードの確認

以下は既存コードから削除される（タブ化により不要）:

- 現在の `<form className="space-y-6">` の `className="space-y-6"` （新しい form は className なし）
- 現在の `<div className="grid gap-6 lg:grid-cols-2">` 2カラムグリッド（各タブが独立）
- 現在のフォームフッターボタン div（スティッキーバーに置き換え）

**「場所・カテゴリー」の JSX は現在の形式をそのまま使う。** 以下の現在のコード（`SpaceEditForm.tsx` の 800〜1080行付近）を参照して詳細設定タブへ移動すること:

- 場所 Select（`locationId`）
- カテゴリー Select（`categoryId`）
- 公開設定（`UnifiedPublishFields`）
- 利用規約 Select（`termsId`）

### Step 7: `bun run type-check` で型確認

```bash
bun run type-check
```

エラーがなければ OK。

### Step 8: コミット

```bash
git add 'src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceEditForm.tsx'
git commit -m "feat(spaces): タブ UI 実装 — nuqs URL タブ + forceMount + エラーバッジ + スティッキー保存バー"
```

---

## Task 2: 検証

**Files:** なし（検証のみ）

### Step 1: `bun run validate` 実行

```bash
bun run validate
```

Expected: `type-check | Done` + `lint | Done`（エラー・警告ゼロ）

### Step 2: `bun run build` 実行

```bash
bun run build
```

Expected: Build successful（Compiled successfully）

### Step 3: コミット（build 確認後）

```bash
git add 'src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceEditForm.tsx'
git commit -m "fix(spaces): validate + build 確認済み"
```

validate/build がすでに通っていれば Task 1 のコミットで完了。追加コミット不要。

---

## 動作確認チェックリスト

実装後、以下を目視確認する:

- [ ] `?tab=basic` / `?tab=pricing` / `?tab=media` / `?tab=details` / `?tab=publish` で URL が切り替わる
- [ ] リロード後に同じタブが表示される（nuqs URL 保持）
- [ ] 保存ボタンが全タブでスクロール最下部に固定表示される
- [ ] 必須フィールドを空のまま「変更を保存」→ エラーバッジがタブに表示される（例: 名前を空欄で送信 → 基本情報タブに `1` バッジ）
- [ ] Ctrl+S でフォームが送信される（useEffectEvent による既存機能）
- [ ] 他のタブで入力中にタブを切り替えても値が保持される（forceMount 確認）
