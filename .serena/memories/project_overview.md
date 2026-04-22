# Myrrh Rental Space

## Purpose
レンタルスペース予約管理システム。公開ページ（顧客向け）と管理画面（オーナー向け）の2つのRoot Layoutで構成。

## Tech Stack
- Next.js 16.1, React 19.2, TypeScript 5.9
- Bun 1.3 (runtime & package manager)
- Prisma 7 / PostgreSQL
- Better Auth 1.4 (認証)
- Tailwind CSS 4 (CSS-first)
- Zod 4, nuqs 2.8, Lexical 0.39
- GSAP + Lenis (アニメーション)
- detect-gpu (GPU検出)

## Structure
- `src/app/(admin)/` - 管理画面 Root Layout
- `src/app/(public)/` - 公開ページ Root Layout
- `src/shared/` - 共有コード (CSS変数非依存)
- `src/app/(public)/_shared/components/effects/core/` - ビジュアルエフェクト基盤

## Aliases
- `@/admin/*`, `@/public/*`, `@/shared/*`

## Key Patterns
- Server Components優先、Server Actions
- React Compiler有効 (自動メモ化)
- `as` 型アサーション禁止
- ハードコードカラー禁止 (セマンティック変数使用)
- OKLCH形式カラー
- Multiple Root Layouts (公開/管理画面完全分離)
