---
description: 管理フォーム widget パターン（ToggleGroup / 複合 widget aria 注入 / FormDescription / Destructive 強調 / 画像 picker / fieldset / Input adornment）
paths:
  - src/app/(admin)/**/*Form.tsx
  - src/app/(admin)/**/*Fields.tsx
  - src/app/(admin)/**/_shared/components/ui/toggle-group.tsx
  - src/app/(admin)/**/_shared/components/ui/input.tsx
  - src/app/(admin)/**/_shared/components/media-picker/**
---

# 管理フォーム widget パターン

> ToggleGroup / 複合 widget の aria 注入 / FormDescription / Destructive 強調レベル / 画像 picker / fieldset cardinality 1 / Input adornment（leadingIcon / trailingIcon）。

## ToggleGroup パターン（セグメント選択）

少数の排他選択肢は `ToggleGroup`（Radix）を使用。生 `<input type="radio">` は禁止。

```tsx
import { ToggleGroup, ToggleGroupItem } from "@/admin/components/ui";

<ToggleGroup
  type="single"
  value={currentValue}
  onValueChange={(v) => {
    if (v) fieldNameControl.change(v); // useInputControl(fields.fieldName)
  }}
>
  <ToggleGroupItem value="sm">小</ToggleGroupItem>
  <ToggleGroupItem value="md">中</ToggleGroupItem>
  <ToggleGroupItem value="lg">大</ToggleGroupItem>
</ToggleGroup>;
```

**`onValueChange` の `if (v)` ガード必須** — Radix ToggleGroup は同じ値を再クリックすると `""` を返す（deselect）。`if (v)` で空文字列を無視する。

**参照実装**: `pages/[slug]/edit/_components/DesignFields.tsx`（ToggleGroup + フラット fieldset + カラーピッカー）

**使い分け:**

| 選択肢数                 | コンポーネント | 例                                       |
| ------------------------ | -------------- | ---------------------------------------- |
| 2-6（テキスト/アイコン） | `ToggleGroup`  | 余白サイズ、テキスト配置、コンテナ幅     |
| 2-6（説明付きカード）    | `SelectionBox` | 決済方法、プラン選択                     |
| 7+                       | `Select`       | タイトルサイズ（6 段階）、アニメーション |

## 複合 widget を `<FormControl>` 配下に置くときの aria 注入

shadcn `<FormControl>` は Radix `Slot` で子 1 個に `id` / `aria-describedby` / `aria-invalid` を注入する。**フォーカス可能要素を持たない複合 widget**（MediaPicker / DnD list / カラースウォッチ群 等）を `<FormControl>` 配下に置く場合、これら 3 props を **シグネチャに追加して primary トリガーボタンに forward** すること。root `<div>` に渡されると `<FormMessage>` の error ID と紐づかず、SR にエラーが伝わらない silent a11y bug になる。

```tsx
// NG: aria 注入を捨てる（root <div> に届くだけで primary トリガーに伝わらない）
function MyComplexField({ value, onChange }: Props) {
  return (
    <div>
      <Button onClick={openPicker}>選択</Button>
    </div>
  );
}

// OK: id / aria-describedby / aria-invalid をシグネチャ受領 → primary トリガーに forward
interface MyComplexFieldProps {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

function MyComplexField({
  value,
  onChange,
  id,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
}: MyComplexFieldProps) {
  return (
    <div>
      <Button
        id={id}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        onClick={openPicker}
      >
        選択
      </Button>
    </div>
  );
}
```

参照実装: `MediaPickerField`(`@/admin/components/media-picker`)。Radix `Slot` は子 Component の関数 props にもマージするため、root JSX 要素ではなくコンポーネント関数引数で受け取れる。

**caveat（button 系コンポーネントの場合）**: primary トリガーが `<button>` のときは `aria-invalid` を forward しない（`jsx-a11y/role-supports-aria-props` が button role での `aria-invalid` を非対応として警告 + ARIA 1.1 まで `aria-invalid` は input 系限定）。エラーメッセージは `aria-describedby` の FormMessage ID 経由で SR に十分伝わるため、`aria-invalid` 受け取り自体を省略する（`MediaPickerField` がこの方針）。

## Switch / Checkbox の補足説明は `<FormDescription>` 必須

`<p className="text-xs text-muted-foreground">` は `<FormControl>` の `aria-describedby` に紐づかない。`<FormDescription>` は `formDescriptionId` を自動付与してコントロールと接続するため、SR が補足を読み上げる。

```tsx
// NG: <p> は aria-describedby に紐づかない
<FormItem>
  <FormControl><Switch ... /></FormControl>
  <p className="text-xs text-muted-foreground">補足説明</p>
</FormItem>

// OK: FormDescription（id 自動付与 + FormControl の aria-describedby に接続）
<FormItem>
  <FormControl><Switch ... /></FormControl>
  <FormDescription className="text-xs">補足説明</FormDescription>
</FormItem>
```

## Destructive アクションの強調レベル基準

業界標準（Material 3 / Apple HIG / GitHub Primer / Bootstrap / WordPress / Stripe / Sanity / Notion / Figma 等横断）:

| 強調レベル                             | variant / className 例                                                            | 採用文脈                                                |
| -------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Filled red**（最強調）               | `variant="destructive"`（赤背景白文字）                                           | **確認モーダル / Danger Zone のみ**。インラインでは過剰 |
| **Outline destructive**（中強調）      | `variant="outline" + border-destructive text-destructive hover:bg-destructive/10` | インライン破壊的アクション（変更ボタンと並ぶ削除等）    |
| **Ghost / link destructive**（弱強調） | `variant="ghost"` + `text-destructive` / link スタイル                            | フォーム state の clear 等、実質的に破壊的でない        |

**判断基準**: 操作が DB に即時反映で不可逆 → Filled。フォーム state のみ・保存前 reset で undo 可能 → Outline 以下。

**Outline destructive 推奨実装**（参照: `MediaPickerField`）:

- `border-destructive`（フル不透明度、隣接する `border-input` outline ボタンと濃度を揃える）
- `text-destructive` + `hover:bg-destructive/10`
- `focus-visible:ring-destructive`（base `ring-ring` を上書き、destructive context の keyboard 経路でも伝達）
- `active:bg-destructive/15`（base `active:scale-[0.98]` と組み合わせ押下感）

## Color picker — 2 input sync (conform `useInputControl`)

`<input type="color">` (visual swatch) と text `<Input>` (hex 入力) を併置する color picker は、**同 `name` を 2 input に register 禁止** (FormData が配列化、`parseWithZod` が最初の値のみ取得して silent bug)。canonical: **単一 `useInputControl` で共通 state にバインド** + hidden input で送信値確定:

```tsx
import { useInputControl } from "@conform-to/react";

const colorControl = useInputControl(fields.color);
const colorValue = colorControl.value ?? "";

<>
  <input type="hidden" name={fields.color.name} value={colorValue} />
  <div className="flex items-center gap-2">
    <input
      id={fields.color.id}
      type="color"
      value={colorValue || "#000000"}
      onChange={(e) => colorControl.change(e.target.value)}
      onBlur={colorControl.blur}
      disabled={isPending}
      aria-label="カラーピッカー"
      className="h-10 w-16 cursor-pointer rounded-md border border-input bg-background p-1"
    />
    <Input
      type="text"
      value={colorValue}
      onChange={(e) => colorControl.change(e.target.value)}
      onBlur={colorControl.blur}
      placeholder="#3B82F6"
      className="flex-1"
      disabled={isPending}
      aria-label="カラーコード"
    />
  </div>
</>;
```

**ルール**:

- `getInputProps(fields.color)` を使わず `value` / `onChange` を手動 wire — `getInputProps` は `name` を生成するため 2 input に展開すると FormData 重複
- `<input type="color">` の `value` は `"#000000"` フォールバック必須 (空文字列は HTML 仕様で reject されコンソール warning 発火)
- 視覚的には swatch / text の 2 input、論理的には 1 form field — Stripe Dashboard / Linear / Sanity Studio の業界標準パターン
- 参照実装: `space-categories/_components/CategoryForm.tsx` (PR #64, 2026-05-16)

## 画像 picker UI のアスペクト比別配置

- **大きい画像（cover / logo / OGP / 幅 200px+）**: 画像下にボタン横並び（業界全社標準: WordPress / Stripe / Notion / Webflow / Sanity）
- **小サムネ（avatar 等、幅 ~64px）**: 画像右横にボタン（Slack / Linear avatar 等の限定パターン）
- **hover overlay（画像内重ね）**: タッチデバイスでアクセス不可のため**インライン文脈では避ける**。常時表示の画像下ボタンが業界標準（GitHub README 画像 / Slack プロフィール画像）
- **fieldset で囲む場合の幅制約**: `sm:grid-cols-2` 内で fieldset 内幅 ≈ 288px。wide (240px) / logo (240px) は画像右横に置く余裕なし、square (128px) のみ理論上可能だが 4 つの一貫性が崩れるため画像下に統一

## `<fieldset>` cardinality 1 の許容

HTML5 仕様 "a set of form controls" は cardinality 1 でも違反ではない（MDN の "single field では通常不要" は推奨であって禁止ではない）。**視覚対称化のために単一 form control を `<fieldset>` で囲んでよい**。fieldset 内で `FormLabel` が legend と冗長になる場合は `sr-only` で残す（`htmlFor` 接続維持のため省略は禁止）。

参照実装: `BasicInfoSection.tsx` のファビコン / OGP fieldset（cardinality 1）と ヘッダー / フッターロゴ fieldset（cardinality 2: 画像 + Switch）

## Input adornment（leadingIcon / trailingIcon）

shadcn `<Input>` (`@/admin/components/ui`) は **`leadingIcon` / `trailingIcon` / `trailingSlot` props** で curation icon の adornment を受け付ける。**inline `<div className="relative">` + `<svg absolute left-3>` + `<Input className="pl-9">` パターン禁止**（DRY 違反）— `<Input leadingIcon="IconSearch" placeholder="検索" aria-label="..." />` で declarative に書く。

- 業界標準: Material UI `InputAdornment` / Tailwind UI `input with leading icon` / Stripe Elements の prefix 慣例
- icon は `aria-hidden="true"` 自動（NN/g + WCAG — SR は label のみ読む）
- icon-only モード禁止（必ず `<Label>` or `aria-label` 併記、必要なら `<FormLabel className="sr-only">`）
- `pointer-events-none` で input click を妨げない
- `pl-9` / `pr-9` の padding 自動付与、未指定なら `<input>` 直接 return（後方互換）

**Section schema で declarative 利用**:

- `field.text("URL", { leadingIcon: "IconLink" })` / `field.text("住所", { leadingIcon: "IconMapPin" })` / `field.text("電話", { leadingIcon: "IconPhone" })`
- `field.url("...")` は **default で `leadingIcon: "IconLink"`** が自動付与（業界 convention）
- `field.number("料金", { leadingIcon: "IconCurrencyYen" })` 等の prefix
- 対応 fieldType: **text / url / number** のみ。`field.textarea` / `field.boolean` / `field.select` / `field.image` / `field.icon` は型は受け付けるが silent ignore（`Textarea` 系は icon adornment 業界標準的に稀のため）
- AutoSectionForm の `case "text" | "url" | "number"` + AutoArrayField の `ArrayItemField` (items[] 内 text/url) で配線済み

**Curation 必須**: `leadingIcon` / `trailingIcon` に渡す名前は `@/shared/lib/icon-curation.ts` の `ICON_CATEGORIES` に登録必須 — 未登録は `getCuratedIconComponent()` で undefined → icon 描画されない silent bug（`field.url()` の default `IconLink` も同 curation に登録済み）。詳細 → `ssot-ui-components.md` §IconPickerField エントリ。
