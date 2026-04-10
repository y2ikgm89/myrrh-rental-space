# ページエディタ リデザイン Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DesignPanel の UX を ToggleGroup + Accordion で改善し、SEO 設定をページレベルタブに昇格させる — **完了**

**Architecture:** SectionMasterDetail にページレベル Tabs（セクション / ページ設定）を追加し、SEO をサイドバーリンクからタブに移動。DesignPanel は Radix ToggleGroup + Accordion で全面書き換え。スキーマ・DB・公開側は変更なし。

**Tech Stack:** React 19, Radix ToggleGroup/Accordion, React Hook Form, nuqs, Tabler Icons

---

## File Structure

| ファイル                                                | 操作     | 責務                                               |
| ------------------------------------------------------- | -------- | -------------------------------------------------- |
| `_shared/components/ui/toggle-group.tsx`                | 新規     | Radix ToggleGroup ラッパー                         |
| `_shared/components/ui/index.ts`                        | 変更     | ToggleGroup + Accordion export 追加                |
| `pages/[slug]/edit/_components/DesignPanel.tsx`         | 書き換え | Accordion + ToggleGroup + カラーピッカーに全面刷新 |
| `pages/[slug]/edit/_components/SectionMasterDetail.tsx` | 変更     | ページレベルタブ追加、SEO 分岐削除                 |
| `pages/[slug]/edit/_components/SectionSidebar.tsx`      | 変更     | SEO リンク削除                                     |

---

### Task 1: Radix ToggleGroup インストール + UI コンポーネント作成

**Files:**

- Modify: `package.json`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/ui/toggle-group.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/ui/index.ts`

- [ ] **Step 1: パッケージインストール**

```bash
bun add @radix-ui/react-toggle-group
```

- [ ] **Step 2: toggle-group.tsx 作成**

`src/app/(admin)/admin/(dashboard)/_shared/components/ui/toggle-group.tsx` を作成。
shadcn/ui 公式の ToggleGroup パターンに準拠（React 19: `ref` は通常 prop、`forwardRef` 不使用）:

```tsx
"use client";

import type { ComponentPropsWithRef } from "react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { cn } from "@/shared/lib/cn";

function ToggleGroup({
  className,
  ref,
  ...props
}: ComponentPropsWithRef<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-muted p-1",
        className,
      )}
      {...props}
    />
  );
}

function ToggleGroupItem({
  className,
  ref,
  ...props
}: ComponentPropsWithRef<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs font-medium transition-all",
        "text-muted-foreground hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        "data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
```

- [ ] **Step 3: ui/index.ts に export 追加**

`index.ts` の末尾に以下を追加:

```ts
// Toggle Group
export { ToggleGroup, ToggleGroupItem } from "./toggle-group";

// Accordion
export {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "./accordion";
```

- [ ] **Step 4: type-check**

```bash
bun run type-check
```

- [ ] **Step 5: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/ui/toggle-group.tsx src/app/\(admin\)/admin/\(dashboard\)/_shared/components/ui/index.ts bun.lock package.json
git commit -m "feat(admin): add ToggleGroup UI component (Radix)"
```

---

### Task 2: DesignPanel 全面書き換え

**Files:**

- Rewrite: `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/DesignPanel.tsx`

- [ ] **Step 1: DesignPanel.tsx を全面書き換え**

以下の完全な実装で置き換える。変更点:

- 生 radio ボタン → ToggleGroup（余白・背景・配置・コンテナ幅）
- RHF `register()` → `useWatch` + `setValue` に統一
- Accordion で4カテゴリに整理（デフォルト全開）
- カラー入力に `<input type="color">` 追加
- テキスト配置に Tabler Icons アイコン使用

```tsx
"use client";

/**
 * DesignPanel — セクション共通デザイン編集パネル
 *
 * Accordion で4カテゴリに整理:
 *   余白 / 背景 / テキスト / レイアウト
 * ToggleGroup で視覚的な選択UI。
 */

import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import {
  IconAlignLeft,
  IconAlignCenter,
  IconAlignRight,
} from "@tabler/icons-react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SubmitButton,
  ToggleGroup,
  ToggleGroupItem,
} from "@/admin/components/ui";

import {
  sectionDesignSchema,
  parseSectionDesign,
  titleSizeValues,
  isTitleSize,
  isSectionAnimation,
  type SectionDesign,
  type SectionDesignInput,
  type TitleSize,
} from "@/shared/lib/validations/section";

// =============================================================================
// Types
// =============================================================================

export interface SectionDesignTarget {
  id: string;
  type: string;
  design: unknown;
}

// =============================================================================
// Option definitions
// =============================================================================

const paddingOptions = [
  { value: "none", label: "なし" },
  { value: "sm", label: "小" },
  { value: "md", label: "中" },
  { value: "lg", label: "大" },
  { value: "xl", label: "特大" },
] as const;

const backgroundOptions = [
  { value: "default", label: "標準", chip: "bg-background border" },
  { value: "surface", label: "表面", chip: "bg-muted" },
  { value: "accent", label: "淡色", chip: "bg-primary/10" },
  { value: "primary", label: "強調", chip: "bg-primary/20" },
  { value: "dark", label: "暗色", chip: "bg-foreground" },
  { value: "image", label: "画像", chip: "bg-muted border-dashed" },
] as const;

const maxWidthOptions = [
  { value: "sm", label: "S", sub: "768" },
  { value: "md", label: "M", sub: "896" },
  { value: "lg", label: "L", sub: "1152" },
  { value: "xl", label: "XL", sub: "1280" },
  { value: "full", label: "全幅", sub: "" },
] as const;

const titleSizeLabels = {
  sm: "小",
  md: "中",
  lg: "大",
  xl: "特大",
  "2xl": "超特大",
  "3xl": "ヒーロー",
} satisfies Record<TitleSize, string>;

const titleSizeOptions = titleSizeValues.map((v) => ({
  value: v,
  label: titleSizeLabels[v],
}));

const animationOptions = [
  { value: "none", label: "なし" },
  { value: "fade", label: "フェード" },
  { value: "slide-up", label: "スライドアップ" },
  { value: "parallax", label: "パララックス" },
] as const;

// =============================================================================
// Component
// =============================================================================

interface DesignPanelProps {
  readonly section: SectionDesignTarget;
  readonly onDesignSave: (design: SectionDesign) => void;
  readonly onDirtyChange?: (dirty: boolean) => void;
}

export function DesignPanel({
  section,
  onDesignSave,
  onDirtyChange,
}: DesignPanelProps) {
  const currentDesign = parseSectionDesign(section.design);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { isDirty },
  } = useForm<SectionDesignInput, unknown, SectionDesign>({
    resolver: standardSchemaResolver(sectionDesignSchema),
    defaultValues: currentDesign,
  });

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const paddingTop = useWatch({ control, name: "paddingTop" });
  const paddingBottom = useWatch({ control, name: "paddingBottom" });
  const background = useWatch({ control, name: "background" });
  const titleSize = useWatch({ control, name: "titleSize" });
  const titleColor = useWatch({ control, name: "titleColor" });
  const textColor = useWatch({ control, name: "textColor" });
  const textAlign = useWatch({ control, name: "textAlign" });
  const maxWidth = useWatch({ control, name: "maxWidth" });
  const animation = useWatch({ control, name: "animation" });

  return (
    <form onSubmit={handleSubmit(onDesignSave)} className="space-y-4">
      <Accordion
        type="multiple"
        defaultValue={["spacing", "background", "text", "layout"]}
        className="space-y-2"
      >
        {/* ── 余白 ───────────────────────────────── */}
        <AccordionItem
          value="spacing"
          className="rounded-lg border px-4 border-b last:border-b"
        >
          <AccordionTrigger className="text-sm font-medium">
            余白
          </AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">上余白</Label>
              <ToggleGroup
                type="single"
                value={paddingTop}
                onValueChange={(v) => {
                  if (v) setValue("paddingTop", v, { shouldDirty: true });
                }}
                className="w-full justify-start"
              >
                {paddingOptions.map((opt) => (
                  <ToggleGroupItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">下余白</Label>
              <ToggleGroup
                type="single"
                value={paddingBottom}
                onValueChange={(v) => {
                  if (v) setValue("paddingBottom", v, { shouldDirty: true });
                }}
                className="w-full justify-start"
              >
                {paddingOptions.map((opt) => (
                  <ToggleGroupItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── 背景 ───────────────────────────────── */}
        <AccordionItem
          value="background"
          className="rounded-lg border px-4 border-b last:border-b"
        >
          <AccordionTrigger className="text-sm font-medium">
            背景
          </AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                背景スタイル
              </Label>
              <ToggleGroup
                type="single"
                value={background}
                onValueChange={(v) => {
                  if (v) setValue("background", v, { shouldDirty: true });
                }}
                className="w-full flex-wrap justify-start"
              >
                {backgroundOptions.map((opt) => (
                  <ToggleGroupItem
                    key={opt.value}
                    value={opt.value}
                    className="gap-1.5"
                  >
                    <span
                      className={`inline-block h-3 w-3 rounded-sm border ${opt.chip}`}
                    />
                    {opt.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            {background === "image" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="design-bg-image" className="text-xs">
                    背景画像URL
                  </Label>
                  <Input
                    id="design-bg-image"
                    {...register("backgroundImageUrl")}
                    placeholder="https://..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="design-overlay" className="text-xs">
                    オーバーレイ不透明度 (%)
                  </Label>
                  <Input
                    id="design-overlay"
                    type="number"
                    min={0}
                    max={100}
                    {...register("backgroundOverlayOpacity", {
                      valueAsNumber: true,
                    })}
                  />
                </div>
              </>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* ── テキスト ──────────────────────────── */}
        <AccordionItem
          value="text"
          className="rounded-lg border px-4 border-b last:border-b"
        >
          <AccordionTrigger className="text-sm font-medium">
            テキスト
          </AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {/* タイトル色 */}
              <div className="space-y-2">
                <Label className="text-xs">タイトル色</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={titleColor || "#000000"}
                    onChange={(e) =>
                      setValue("titleColor", e.target.value, {
                        shouldDirty: true,
                      })
                    }
                    className="h-9 w-9 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0.5"
                  />
                  <Input
                    value={titleColor || ""}
                    onChange={(e) =>
                      setValue("titleColor", e.target.value, {
                        shouldDirty: true,
                      })
                    }
                    placeholder="#000000"
                    className="flex-1"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  空欄でデフォルト色
                </p>
              </div>

              {/* タイトルサイズ */}
              <div className="space-y-2">
                <Label className="text-xs">タイトルサイズ</Label>
                <Select
                  {...(titleSize !== undefined && { value: titleSize })}
                  onValueChange={(val) => {
                    if (isTitleSize(val))
                      setValue("titleSize", val, { shouldDirty: true });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {titleSizeOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* テキスト色 */}
              <div className="space-y-2">
                <Label className="text-xs">テキスト色</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={textColor || "#666666"}
                    onChange={(e) =>
                      setValue("textColor", e.target.value, {
                        shouldDirty: true,
                      })
                    }
                    className="h-9 w-9 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0.5"
                  />
                  <Input
                    value={textColor || ""}
                    onChange={(e) =>
                      setValue("textColor", e.target.value, {
                        shouldDirty: true,
                      })
                    }
                    placeholder="#666666"
                    className="flex-1"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  空欄でデフォルト色
                </p>
              </div>

              {/* テキスト配置 */}
              <div className="space-y-2">
                <Label className="text-xs">テキスト配置</Label>
                <ToggleGroup
                  type="single"
                  value={textAlign}
                  onValueChange={(v) => {
                    if (v) setValue("textAlign", v, { shouldDirty: true });
                  }}
                >
                  <ToggleGroupItem value="left" aria-label="左揃え">
                    <IconAlignLeft className="h-4 w-4" />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="center" aria-label="中央揃え">
                    <IconAlignCenter className="h-4 w-4" />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="right" aria-label="右揃え">
                    <IconAlignRight className="h-4 w-4" />
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── レイアウト ─────────────────────────── */}
        <AccordionItem
          value="layout"
          className="rounded-lg border px-4 border-b last:border-b"
        >
          <AccordionTrigger className="text-sm font-medium">
            レイアウト
          </AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                コンテナ幅
              </Label>
              <ToggleGroup
                type="single"
                value={maxWidth}
                onValueChange={(v) => {
                  if (v) setValue("maxWidth", v, { shouldDirty: true });
                }}
                className="w-full justify-start"
              >
                {maxWidthOptions.map((opt) => (
                  <ToggleGroupItem key={opt.value} value={opt.value}>
                    <span>{opt.label}</span>
                    {opt.sub && (
                      <span className="text-[10px] text-muted-foreground">
                        {opt.sub}
                      </span>
                    )}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                アニメーション
              </Label>
              <Select
                {...(animation !== undefined && { value: animation })}
                onValueChange={(val) => {
                  if (isSectionAnimation(val))
                    setValue("animation", val, { shouldDirty: true });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {animationOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="design-custom-class" className="text-xs">
                カスタムCSSクラス
              </Label>
              <Input
                id="design-custom-class"
                {...register("customClass")}
                placeholder="追加のTailwindクラス"
              />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="flex justify-end pt-2">
        <SubmitButton
          isPending={false}
          label="デザインを保存"
          pendingLabel="保存中..."
        />
      </div>
    </form>
  );
}
```

- [ ] **Step 2: type-check**

```bash
bun run type-check
```

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/DesignPanel.tsx'
git commit -m "feat(admin): rewrite DesignPanel with ToggleGroup + Accordion"
```

---

### Task 3: SectionSidebar から SEO リンクを削除

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionSidebar.tsx`

- [ ] **Step 1: SEO リンクと SEO_SELECTION_ID を削除**

`SectionSidebar.tsx` から以下を削除:

1. `SEO_SELECTION_ID` 定数の定義と export
2. `IconWorld` の import
3. `Separator` の import（他で使っていなければ）
4. `{/* Bottom Actions */}` セクション内の `<Separator />` と SEO ボタン

Bottom Actions セクションを以下に簡素化:

```tsx
{
  /* Bottom Actions */
}
<div className="border-t px-3 py-3">
  <Button
    onClick={onAddSection}
    disabled={disabled}
    className="w-full"
    size="sm"
  >
    <IconPlus className="h-4 w-4 mr-2" />
    セクションを追加
  </Button>
</div>;
```

import を整理:

```tsx
import { Button } from "@/admin/components/ui";
import { IconPlus } from "@tabler/icons-react";
```

`Separator`, `IconWorld` の import と `SEO_SELECTION_ID` の export/定義を削除。

- [ ] **Step 2: type-check で壊れた参照を確認**

```bash
bun run type-check
```

`SEO_SELECTION_ID` を参照している箇所（`SectionMasterDetail.tsx`）でエラーが出るが、Task 4 で修正する。

- [ ] **Step 3: コミット（Task 4 と合わせて）**

Task 4 完了後に一括コミット。

---

### Task 4: SectionMasterDetail にページレベルタブを追加

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionMasterDetail.tsx`

- [ ] **Step 1: ページレベルタブを追加し SEO 分岐を削除**

`SectionMasterDetail.tsx` を以下のように変更:

**1. import の変更:**

```tsx
// 削除:
import { SectionSidebar, SEO_SELECTION_ID } from "./SectionSidebar";
import { PageSeoForm } from "../../_seo/_components/PageSeoForm";

// 追加:
import { parseAsStringLiteral } from "nuqs";
import { SectionSidebar } from "./SectionSidebar";
import { PageSeoForm } from "../../_seo/_components/PageSeoForm";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/admin/components/ui";
```

**2. コンポーネント内に `pageTab` state を追加（`isPending` の下あたり）:**

```tsx
const PAGE_TAB_VALUES = ["sections", "settings"] as const;
const [pageTab, setPageTab] = useQueryState(
  "tab",
  parseAsStringLiteral(PAGE_TAB_VALUES)
    .withDefault("sections")
    .withOptions({ history: "push", shallow: true }),
);
```

**3. `handleSelect` から SEO 関連ロジックを削除:**

`effectiveSelectedId` の計算で `SEO_SELECTION_ID` を参照している部分を削除。

変更前:

```tsx
const effectiveSelectedId = selectedId ?? sections?.[0]?.id ?? null;
const selectedSection =
  sections?.find((s) => s.id === effectiveSelectedId) ?? null;
```

変更後（同じ — SEO_SELECTION_ID の参照がなくなるだけ）:

```tsx
const effectiveSelectedId = selectedId ?? sections?.[0]?.id ?? null;
const selectedSection =
  sections?.find((s) => s.id === effectiveSelectedId) ?? null;
```

**4. Render セクションを全面変更:**

`isSeoSelected` 変数と関連分岐を削除。
Render の return 文を以下に置き換え:

```tsx
return (
  <>
    <Tabs
      value={pageTab ?? "sections"}
      onValueChange={(v) => void setPageTab(v)}
    >
      <TabsList className="mb-4">
        <TabsTrigger value="sections">セクション</TabsTrigger>
        <TabsTrigger value="settings">ページ設定</TabsTrigger>
      </TabsList>

      <TabsContent
        value="sections"
        forceMount
        className="data-[state=inactive]:hidden"
      >
        <div className="flex flex-col lg:grid lg:grid-cols-[320px_1fr] gap-0 h-auto lg:h-[calc(100vh-280px)]">
          {/* Left Sidebar */}
          <div
            className={cn(
              "border-b lg:border-b-0 lg:border-r overflow-hidden",
              "lg:block",
              showMobileList ? "flex-1" : "hidden",
            )}
          >
            <SectionSidebar
              sections={sections}
              selectedId={effectiveSelectedId}
              onSelect={handleSelect}
              onReorder={handleReorder}
              onToggle={handleToggle}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
              onAddSection={() => setShowAddDialog(true)}
              disabled={isPending}
            />
          </div>

          {/* Right Detail Panel */}
          <div
            className={cn(
              "overflow-y-auto px-4 py-4 lg:px-6",
              "lg:block",
              showMobileList ? "hidden" : "flex-1",
            )}
          >
            <MobileBackButton onClick={handleBackToList} />
            <SectionDetailPanel
              section={selectedSection}
              hasSections={sections.length > 0}
              onAddSection={() => setShowAddDialog(true)}
              onSectionUpdated={handleSectionUpdated}
              onDirtyChange={handleDirtyChange}
            />
          </div>
        </div>
      </TabsContent>

      <TabsContent
        value="settings"
        forceMount
        className="data-[state=inactive]:hidden"
      >
        <PageSeoForm page={page} />
      </TabsContent>
    </Tabs>

    <AddSectionDialog
      open={showAddDialog}
      onOpenChange={setShowAddDialog}
      onAdd={handleAddSection}
      disabled={isPending}
    />
  </>
);
```

**5. `isSeoSelected` 変数の行を削除**

- [ ] **Step 2: type-check + lint**

```bash
bun run validate
```

- [ ] **Step 3: コミット（Task 3 と合わせて）**

```bash
git add 'src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionSidebar.tsx' 'src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionMasterDetail.tsx'
git commit -m "feat(admin): promote SEO to page-level tab, remove sidebar link"
```

---

### Task 5: 検証 + ビルド

**Files:** なし（検証のみ）

- [ ] **Step 1: validate**

```bash
bun run validate
```

型エラー・lint エラーがあれば修正。

- [ ] **Step 2: build**

```bash
bun run build
```

ビルドエラーがあれば修正。

- [ ] **Step 3: 最終コミット（修正があれば）**

修正があった場合のみコミット:

```bash
git commit -m "fix(admin): resolve type/lint errors from page editor redesign"
```
