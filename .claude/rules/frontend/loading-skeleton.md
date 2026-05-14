---
description: Loading UI / Skeleton パターン — Skeleton primitive (public/admin) + DetailLoading / FormLoading / EditorLoading SSoT + spinner-only 禁止
paths:
  - "src/app/**/loading.tsx"
  - "src/app/**/skeleton*.tsx"
  - "src/app/**/Skeleton*.tsx"
  - "src/app/**/_components/skeletons/**"
  - "src/app/(admin)/admin/(dashboard)/_shared/components/{DetailLoading,FormLoading,EditorLoading,LoadingState}.tsx"
  - "src/app/(public)/mypage/_components/mypage-skeleton.tsx"
---

# Loading UI / Skeleton パターン

> Next.js Loading UI 公式 + shadcn/ui canonical + Nielsen Norman Group / Apple HIG 準拠。spinner-only fallback は perceived wait time が長くなるため avoid pattern。

## SSoT 一覧

| SSoT                | 場所                                                                    | 用途                                                                                |
| ------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `Skeleton` (public) | `@/public/components/design-system/skeleton`                            | `animate-pulse bg-surface` + variant 3 種（`default` / `circle` / `text`）          |
| `Skeleton` (admin)  | `@/admin/components/ui` (barrel) + `_shared/components/ui/skeleton.tsx` | `animate-pulse bg-muted` + variant 3 種                                             |
| `DetailLoading`     | `(admin)/_shared/components/DetailLoading.tsx`                          | admin `[id]/loading.tsx` (詳細) — back + header + detail field rows                 |
| `FormLoading`       | `(admin)/_shared/components/FormLoading.tsx`                            | admin `new/loading.tsx` + 非 Lexical `[id]/edit/loading.tsx` — back + 2-col form    |
| `EditorLoading`     | `(admin)/_shared/components/EditorLoading.tsx`                          | Lexical 系 (posts/news/terms/pages) — fixed h-14 header + toolbar + 420px inspector |
| `MypageSkeleton`    | `mypage/_components/mypage-skeleton.tsx`                                | mypage 共通 — variant: `list` / `detail` / `form`                                   |

## 新規 loading.tsx の追加判断フロー

1. admin 詳細 `[id]/page.tsx` の loading → `DetailLoading` re-export
2. admin 非 Lexical form (`new/page.tsx` / `[id]/edit/page.tsx`) → `FormLoading` re-export
3. admin Lexical editor (posts / news / terms / pages) → `EditorLoading` re-export
4. mypage 配下 → `MypageSkeleton variant="list|detail|form"`
5. 上記に当てはまらない特殊レイアウト (calendar / media grid / settings hub / faq master-detail 等) → ページ固有 loading.tsx を `Skeleton` primitive で実装
6. 一般的なリスト系 admin ページ → `(dashboard)/loading.tsx` の汎用 table fallback で自動カバーされるため通常は新規不要

## 1 行 re-export パターン（form/editor/detail）

```tsx
// admin/(dashboard)/<resource>/new/loading.tsx
export { default } from "../../_shared/components/FormLoading";

// admin/(dashboard)/<resource>/[id]/edit/loading.tsx
export { default } from "../../../_shared/components/FormLoading";

// admin/(dashboard)/<resource>/[id]/loading.tsx
export { default } from "../../_shared/components/DetailLoading";

// admin/(dashboard)/posts/new/loading.tsx (Lexical 系)
export { default } from "../../_shared/components/EditorLoading";
```

内容直書き禁止 — 各 loading.tsx は SSoT を re-export する 1 行のみ。

## 禁止事項

1. **spinner-only `loading.tsx` 禁止** — `<div className="animate-spin rounded-full border-..." />` 単独は perceived wait time が長くなる。実 UI の shape を反映した Skeleton を返す
2. **Skeleton primitive を経由せず `animate-pulse bg-muted` / `bg-surface` 直書き禁止** — 必ず `<Skeleton />` 経由（variant + className 渡し）。1 ファイル内で複数箇所重複時は再利用性が損なわれる
3. **新規 admin form / editor の `loading.tsx` で内容を直書き禁止** — 上記 re-export パターンが canonical。SSoT 経由でない実装は重複定義として扱う
4. **mypage 配下で `MypageSkeleton` 以外の独自 loading skeleton 禁止** — `variant: list/detail/form` の 3 種で全カバー済
5. **Skeleton 内に `text-*` / `bg-*-fg` 等のテキスト色禁止** — Skeleton は背景パターンのみ。テキスト風要素も `variant="text"` で背景描画する

## Skeleton 実装ルール

- サイズは `<Skeleton className="h-N w-N" />` で渡す
  - `h-3` = small label / eyebrow
  - `h-4` = body text / inline element
  - `h-5` = heading sm / badge
  - `h-8` / `h-10` = heading lg
  - `h-11` = input / button (44px WCAG 2.5.5 準拠)
- 画像領域は `aspect-[N/M]` + `w-full` を併用（aspect-video / aspect-square / aspect-[4/3] / aspect-[3/2] / aspect-[16/9] 等、実 UI に合わせる）
- `aria-busy="true"` をルート要素に付与（Skeleton primitive 自身は `aria-hidden="true"` 内蔵のため重ねない）
- `bg-surface` (public) / `bg-muted` (admin) は theme token のため両 Root Layout で自動切替
- ループ生成は `Array.from({ length: N }, (_, i) => <Skeleton key={i} ... />)` パターン

## 公開ページ loading.tsx の構造原則

`PageLayout variant="content"` + `Container` 配下で以下の順で配置:

1. **Page hero placeholder** — `<section className="border-b border-border bg-background py-[var(--space-xl)]">` で `StandardHeroSection variant="minimal"` を模倣（旧 `bg-gradient-to-b from-surface via-background to-background` は axe-core が bgGradient incomplete で評価できず production build で violation 昇格する silent bug のため solid `bg-background` + border separation に統一、2026-05-14）
2. **本文セクション** — Container 内に `space-y-* py-[var(--space-lg)]` で複数 skeleton を縦積み

詳細ページ (posts / news / events / spaces / access) は ArticleLayout 反映:

- Breadcrumb 帯 (`<div className="border-b border-divider bg-surface">`)
- Article header (h1 + meta + thumbnail aspect-video)
- Prose body (`space-y-4` の text rows)
- Sidebar (lg+ で `<aside>` 280px)

## 管理画面 loading.tsx の構造原則

- `(dashboard)/loading.tsx` は **リスト系汎用 fallback**（header + filter bar + table 5 rows + pagination）
- 個別 `loading.tsx` が存在する場合はそちらが優先される（Next.js 公式仕様）
- 特殊レイアウト固有 loading（calendar / media / settings / faq）は `Skeleton` primitive を使って実 UI の grid / card 構造を反映

## 参照実装

- public primitive: `src/app/(public)/_shared/components/design-system/skeleton.tsx`
- admin primitive: `src/app/(admin)/admin/(dashboard)/_shared/components/ui/skeleton.tsx`
- form SSoT: `(dashboard)/_shared/components/FormLoading.tsx`
- editor SSoT: `(dashboard)/_shared/components/EditorLoading.tsx`
- detail SSoT: `(dashboard)/_shared/components/DetailLoading.tsx`
- mypage SSoT: `(public)/mypage/_components/mypage-skeleton.tsx`
- 特殊例 (4 件): `reservations/calendar/loading.tsx` / `media/loading.tsx` / `settings/loading.tsx` / `faq/loading.tsx`

## 参考

- [Next.js — Loading UI and Streaming](https://nextjs.org/docs/app/getting-started/loading-ui-and-streaming) — `loading.tsx` 公式ガイダンス
- [shadcn/ui — Skeleton](https://ui.shadcn.com/docs/components/skeleton) — Skeleton primitive canonical
- [Nielsen Norman Group — Progress Indicators](https://www.nngroup.com/articles/progress-indicators/) — skeleton screens reduce perceived wait time
- [Apple HIG — Progress Indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators) — spinner は短時間操作 (<1s) 限定推奨
