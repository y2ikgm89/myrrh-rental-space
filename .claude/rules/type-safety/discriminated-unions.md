---
description: Mutually Exclusive Props の Discriminated Union + Sanity Portable Text 互換 `_type` discriminator + `satisfies` キーワード + `as const satisfies` の test 推論問題
paths:
  - src/**/*.ts
  - src/**/*.tsx
  - src/shared/lib/portable-text/**
---

# Discriminated Union + satisfies

> 排他 prop を型レベルで弾く discriminated union + Sanity Portable Text 互換の `_type` discriminator + `satisfies` の使い分け + `as const satisfies` の narrow tuple 落とし穴。

## Mutually Exclusive Props は Discriminated Union

排他的な prop の組合せ（`fill` vs `width+height`、`controlled` vs `uncontrolled` 等）は型レベル排他化。
runtime check ではなくコンパイル時に invalid combination を弾くのが公式 TypeScript パターン:

```typescript
// NG: 任意組合せが許容され invalid state でランタイムエラー
interface Props {
  width?: number;
  height?: number;
  fill?: boolean;
  aspect?: AspectRatio; // aspect 単独だと width/height/fill 全部欠落 → next/image エラー
}

// OK: discriminated union で排他化
interface FillProps {
  fill: true;
  aspect?: AspectRatio;
  width?: never; // 型レベル禁止
  height?: never;
}
interface DimensionProps {
  fill?: never;
  aspect?: never; // dimension 指定時は aspect 不要
  width: number;
  height: number;
}
type Props = FillProps | DimensionProps;
```

**判定基準**: 「prop A と prop B が同時指定されると invalid state になる」場合は discriminated union 化。
runtime エラーやサイレントバグを防ぐ。新規コンポーネント設計時のデフォルトパターンとする。

参照実装: `@/public/components/design-system/image-frame.tsx`（`FillProps | DimensionProps`）。
Next.js `<Image>` の「width+height OR fill 必須」契約を型レベルで強制。

## Sanity Portable Text 互換の `_type` discriminator

公式 Sanity Portable Text 仕様では discriminated union の discriminator field を `_type` (underscore prefix) とする。本プロジェクトの `PortableTextSpan` / `PortableTextBlock` も同仕様準拠で実装する：

```typescript
// @/shared/lib/portable-text/schema.ts
export const portableTextSpanSchema = z.discriminatedUnion("_type", [
  z.object({
    _key: z.string().min(1),
    _type: z.literal("span"),
    text: z.string().max(500),
  }),
  z.object({
    _key: z.string().min(1),
    _type: z.literal("iconInline"),
    name: z.string().regex(/^Icon[A-Z][A-Za-z0-9]*$/),
  }),
]);
```

旧 `type: "..."` 形式（`ButtonLabelToken`）は 2026-05-09 Phase 0 で完全廃止済み。新規 schema 追加時は `_type` 命名を踏襲する（Sanity Portable Text 公式 / Sanity Studio の Block Content と同 shape を保つことで将来的な editor 統合・JSON 互換性を確保）。

## `satisfies` キーワード

型チェックを維持しながら定数オブジェクトのプロパティ型を保持する:

```typescript
// NG: as キャスト（個別プロパティの型情報が失われる）
const STATUS_CONFIG = {
  active: { label: "有効", variant: "success" },
  inactive: { label: "無効", variant: "destructive" },
} as Record<string, StatusConfig>;

// OK: satisfies（型チェック + プロパティ型保持）
const STATUS_CONFIG = {
  active: { label: "有効", variant: "success" },
  inactive: { label: "無効", variant: "destructive" },
} satisfies Record<string, StatusConfig>;

// satisfies の利点: palette.red は string でなく [number, number, number] として推論される
type RGB = [number, number, number];
const palette = {
  red: [255, 0, 0],
  green: "#00ff00",
} satisfies Record<string, string | RGB>;
const red = palette.red; // [number, number, number]（string | RGB ではなく）
```

## `as const satisfies Record<...>` の narrow tuple は test 推論と非互換

`as const satisfies` は production code で `keyof typeof X` を strict literal union に narrow するが、bun:test の `expect()` 引数推論で narrow tuple が壊れて TS2339 / TS2769 を起こす。production も test も string-keyed access が中心なら型注釈で widening する方が clean:

```typescript
// NG: narrow tuple が test の expect 引数推論を壊す + Record union member 間で optional field の存在差が出る
export const PAGE_TEMPLATES = {
  home: { id: "home", allowedSectionTypes: ["page-hero", ...], requiredSectionTypes: ["page-hero"] },
  content: { id: "content", allowedSectionTypes: [...] }, // requiredSectionTypes なし
} as const satisfies Record<string, PageTemplate>;
// test 側で `tpl.requiredSectionTypes ?? []` が TS2339（content union member に field なし）

// OK: 型注釈で widening — PageTemplate 型に union 統一され optional fields が全 entry で同型
export const PAGE_TEMPLATES: Record<string, PageTemplate> = {
  home: { ... },
  content: { ... },
};
```

**判定基準**: `keyof typeof X` を strict literal union として export したい（特定の id のみ受け付ける関数 signature 等）→ `as const satisfies` 維持 + test 側で必要に応じて広い型へ narrow。一般的な `string` key access が中心 → `: Record<string, T>` widening を選択。Phase 1（2026-05-05 PAGE_TEMPLATES）で後者に切替えた事例あり（`PageTemplateId` export を削除）。

## typedRoutes + dynamic query: string literal union で列挙

Next.js 16 `typedRoutes: true` 環境で `?tab=X` 等の query を含む `Link href` prop の型注釈は、template literal type ではなく **literal union** で列挙する。`Route<string>` 型は template literal から推論できないため `` `/admin/settings/${T}?tab=${string}` `` は型エラーになる。

```typescript
// NG: typedRoutes 非互換（Route<string> に推論されない）
readonly href: `/admin/settings/${"billing" | "integrations"}?tab=${string}`;

// OK: literal union で全列挙
readonly href:
  | "/admin/settings/integrations?tab=resend"
  | "/admin/settings/integrations?tab=turnstile"
  | "/admin/settings/integrations?tab=calendar"
  | "/admin/settings/billing?tab=payment";
```

参照実装: `IntegrationHealthAlertClient.tsx` の `href` フィールド型（2026-05-11 settings 再編で 4 統合の deep link 用に追加）。

**tab `value` 同期規律**: `?tab=X` 形式の deep link を新規追加するときは、page.tsx の `tabs[].value` と grep で同期確認する。`grep -rn 'tab=' src/ --include="*.ts" --include="*.tsx"` で list-up し、各 query 値が対応する page.tsx の `value` literal に存在するかチェック。drift があると link で開いてもデフォルトタブにフォールバックして silent UX bug になる。
