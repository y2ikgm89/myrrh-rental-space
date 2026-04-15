# 0001. Multiple Root Layouts で公開ページと管理画面を完全分離

- **Status**: Accepted
- **Date**: 2026-03-17
- **Deciders**: @y2ikgm89
- **Tags**: architecture, routing, styling

## Context and Problem Statement

初期実装では公開ページ（`/`, `/spaces`, `/reservation`）と管理画面（`/admin/*`）が同じ Root Layout を共有していた。以下の問題が発生していた:

- CSS 変数・テーマトークンの衝突（公開は Editorial Magazine / 管理は Swiss Industrial）
- Better Auth dual instance（adminAuth / customerAuth）の Provider 配置混乱
- LenisProvider / GSAP providers が管理画面にまで読み込まれてバンドルが肥大化
- Multi-theme の CSS 分離が困難（`@theme` の scope 管理）

## Decision Drivers

- CSS・認証・Provider の完全分離
- 管理画面と公開画面で異なるタイポグラフィ・カラーパレット・Compiler preset
- 公開側のパフォーマンス最優先（管理側の重いライブラリを含めない）
- Next.js 16 公式推奨パターンとの整合

## Considered Options

1. **単一 Root Layout + 条件分岐 CSS**（初期実装）
2. **Next.js Route Groups だけで分離（同一 layout.tsx）**
3. **Multiple Root Layouts（公開 / 管理 でそれぞれ html/body 定義）**

## Decision Outcome

**Chosen option**: "Multiple Root Layouts"

Next.js 16 の [Multiple Root Layouts](https://nextjs.org/docs/app/building-your-application/routing/route-groups#creating-multiple-root-layouts) パターンを採用。`src/app/(public)/layout.tsx` と `src/app/(admin)/layout.tsx` がそれぞれ独立した `html` / `body` / CSS import を持ち、Route Group 間の遷移はフルページリロードとなる。

### Consequences

**良い点**:

- `public.css`（Editorial Magazine / Cormorant Garamond / Bronze accent）と `admin.css`（Swiss Industrial / Trust Blue）が完全分離
- LenisProvider / GSAP / Lexical が管理側に含まれず、公開側の First Load JS を最小化
- `adminAuth` と `customerAuth` の cookie prefix 分離が自然に実現
- Better Auth の dual instance pattern が layout レベルで明示される

**悪い点 / トレードオフ**:

- 公開 ↔ 管理の遷移はフルページリロードになる（同一セッション内の SPA 遷移不可）
- 共有コンポーネント（`src/shared/`）は CSS 変数に依存しない設計が必要
- dev サーバー再起動時に両 Root が独立してコンパイルされる

### Compliance / Validation

- `__tests__/unit/architecture-boundaries.test.ts` で layout ファイル構造を検証
- `CLAUDE.md` ハードルール §Multiple Root Layouts に明記
- `src/shared/` から `(public)/` `(admin)/` の CSS 変数を直接参照しないことを ESLint で警告

## Pros and Cons of the Options

### Option 1: 単一 Root Layout + 条件分岐 CSS

- ✅ 実装シンプル、SPA 遷移が自然
- ❌ CSS が衝突、テーマ切替が条件分岐で複雑化
- ❌ Provider が常に両方のテーマ向けに展開される

### Option 2: Route Groups のみで分離（同一 layout.tsx）

- ✅ フルページリロード不要
- ❌ CSS 分離が不完全、`@theme` scope 問題
- ❌ 認証 Provider の二重配置が必要

### Option 3: Multiple Root Layouts ✅ 採用

- ✅ 完全分離、Next.js 公式推奨
- ⚠️ フルページリロードの受容
- ✅ CSS / 認証 / Provider がクリーンに分離

## Links / References

- [Next.js Multiple Root Layouts 公式ドキュメント](https://nextjs.org/docs/app/building-your-application/routing/route-groups#creating-multiple-root-layouts)
- [`CLAUDE.md` §Multiple Root Layouts](../../../CLAUDE.md)
- [`.claude/rules/project-structure.md`](../../../.claude/rules/project-structure.md)
- 関連実装: `src/app/(public)/layout.tsx`, `src/app/(admin)/layout.tsx`
