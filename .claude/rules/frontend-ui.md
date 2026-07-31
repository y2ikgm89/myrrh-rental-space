---
paths:
  [
    "src/app/(public)/_shared/components/**",
    "src/app/(admin)/admin/(dashboard)/_shared/components/**",
    "src/**/*.css",
    "src/shared/lib/cn.ts",
    "src/shared/styles/**",
    "components.json",
  ]
---

# フロントエンド UI 規約

## Tailwind v4（CSS-first・config ファイルなし）

- テーマは二重定義: 公開 = `src/app/(public)/_styles/public.css`、
  管理 = `src/app/(admin)/_styles/admin.css`（それぞれ `@theme`、OKLCH）
- `@theme` トークン名は built-in utility と衝突させない（`--container-max` は
  w-max を shadow するため `--container-site` に改名済み・テストが再導入を禁止）
- 新しい `--text-*` トークンは `src/shared/lib/cn.ts` の CUSTOM_FONT_SIZES への追記必須。
  忘れると tailwind-merge が text-color と誤分類し font-size クラスが silent drop する
- `src/shared/styles/lexical-content.css` は意図的に `@layer` 外（最高優先度）。
  @layer 内に移すと prose に負けて表示が崩れる

## 公開側（design-system・shadcn 不使用）

- プリミティブは `(public)/_shared/components/design-system/` の 16 種を使う
- セクション余白の SSoT は SectionStack の gap。セクション系 surface への
  `px-4` / `px-6` 直書きは禁止（テスト強制）。横 padding は Container / SectionWrapper の
  `--container-padding-start/end` トークン（safe-area 込み）経由
- タッチ標的は 44px（`--touch-target-min`）を満たす。focus-visible outline と
  prefers-reduced-motion のグローバル対策は public.css にあり、壊さない

## 管理側（shadcn new-york + tailwind-variants）

- shadcn 生成物は `@/admin/components/ui/` のみ。スタイルは `tv()` + radix-ui Slot
- 生パレットクラス（bg-gray-\* / text-slate-\* 等 9 パターン）は禁止 →
  セマンティックトークンのみ（`admin-design-tokens.test.ts` が強制）
- **「押せるが控えめ」の減光を `opacity-*` / alpha modifier（`text-foo/80`）で
  作らない**。CSS の opacity は要素と子孫を 1 枚のグループとして合成する仕様
  （[CSS Color 4](https://www.w3.org/TR/css-color-4/#transparency)）なので、
  subtree の**前景も背景も**畳み込まれ、宣言した色から実効コントラストが読めなくなる。
  入れ子になると指数的に落ちる（実測: `opacity-80` × `/80` = 実効 alpha 0.64 →
  3.54:1）。減光は専用トークン 1 本で表現し、余裕が無い明色テーマでは減光しない。
  `disabled` 属性を持つ本当に不活性なコントロール（`disabled:opacity-50` 等）は
  WCAG 2.1 SC 1.4.3 の Incidental 例外に当たるため対象外。
  feature module OFF 表示は `admin-feature-disabled-contrast.test.ts` が機械強制する
- フォーム送信ボタンは `SubmitButton` に統一。`<Button type="submit">` 直書きは
  テストで禁止
- z-index は `Z_INDEX` 定数を **inline style の `zIndex`** で適用する。
  ``className={`z-[${Z_INDEX.x}]`}`` は Tailwind JIT で CSS 未生成の silent bug
- media/\_components・editor/lexical・media-picker の 3 ディレクトリは
  ユーザーアップロード・blob・外部 URL 等 Next.js Image で最適化できない画像を扱うため、
  `@next/next/no-img-element` が意図的に除外されている（`<img>` 直書きが正。
  next/image への「修正」は不要）

## アニメーション（GSAP / Lenis）

- gsap / ScrollTrigger は `@/public/lib/gsap-config` から import（registerPlugin 一元化）。
  useGSAP hook は `@gsap/react` から直 import
- アニメは `gsap.matchMedia().add("(prefers-reduced-motion: no-preference)")` ゲート内で
  定義するか、`useMotionPreference()` の ref でハンドラ内判定する
- アニメ定数（DURATION / EASE / STAGGER 等）は `(public)/_shared/lib/animations.ts` が SSoT

## 検証

admin UI 変更後は `bun scripts/run-tests.ts __tests__/unit/architecture/admin-design-tokens.test.ts`
と `admin-submit-button-pattern.test.ts`、色を触ったなら
`admin-feature-disabled-contrast.test.ts` も実行する。a11y は
`bunx playwright test --project=chromium`（axe + keyboard spec を含む）。
管理画面の axe は `--project=chromium-admin`（機能モジュール OFF 状態の
`axe-admin-feature-disabled.spec.ts` を含む）。
