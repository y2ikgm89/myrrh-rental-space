# Serena Project Memory

> Topic-specific findings cataloged here for cross-session reuse via Serena `read_memory`.
> Configuration SSoT: `.serena/project.yml` (`read_only_memory_patterns` で主要 architecture を保護指定).
> Stale point-in-time audits は `.archive/2026-Q1/` に物理保管。`ignored_memory_patterns: ["_archive/.*"]` で `list_memories` 出力から自動除外。

## Active memory files

### Design / public

- `design-system.md` — Editorial Magazine + Kinfolk/Cereal 系統 typography scale + OKLCH カラー割合 + spatial / motion design SSoT（`.claude/rules/frontend/project-design-config.md` の補完）

### Admin domain

- `admin-architecture-comprehensive-analysis.md` — 管理画面アーキテクチャ全体俯瞰
- `admin-layer-architecture.md` — 管理層レイヤー分割
- `admin-crud-inventory.md` — CRUD 一覧 + リソース別 status
- `admin-crud-patterns-analysis.md` — CRUD パターン詳細分析
- `admin-page-editing-system.md` — 管理画面ページ編集システム
- `admin-resource-audit.md` — リソース横断監査
- `admin-shared-infrastructure.md` — 管理画面共有基盤
- `admin-forms/patterns.md` — フォーム実装パターン

### Architecture / framework

- `architecture/next16-audit-complete.md` — Next.js 16 採用状況監査
- `architecture/next16-comprehensive-exploration-2026-03-29.md` — Next.js 16 機能調査 snapshot
- `data-flow/public-to-admin-analysis.md` — 公開 ↔ 管理間データフロー

### Domain

- `reservation-customer-system.md` — 予約・顧客ドメイン全体
- `section-system-research.md` — Section registry + dynamic rendering
- `project/phase2-event-registration-patterns.md` — Phase 2 イベント登録パターン

### Editor

- `lexical/node-implementation-patterns.md` — Lexical ノード実装パターン SSoT

## Confirmed false-positives (carry across sessions)

1. `api-keys.ts` catch blocks `} catch {` without error binding — valid TS5.x syntax, NOT empty catch. They return `createMutationError()`.
2. `google-calendar.ts` / `stripe.ts` connection-test actions use custom return types (`Promise<{ success: boolean; ... }>`), NOT `MutationResult`. Intentional for richer test response shape.
3. Lexical plugin color swatches (`bg-yellow-300` etc.) in `HighlightPlugin.tsx` / `TextColorPlugin.tsx` are explicitly allowed by `tailwind-patterns/theme-tokens.md` exception.
4. Section validation schemas (`section.ts`, `section-design.ts`) use `.default('md')` etc. on local `as const` arrays — NOT Prisma enum defaults. Correct pattern.
5. `CouponForm.tsx` / `CustomerForm.tsx` client-side handlers return `{ success, message }` shaped objects — these are NOT Server Actions, they are client form handlers.
6. `setView()` / `setStatusFilter()` / `setCategory()` in CalendarToolbar/PostFilters are wrapper functions (internally use `void setParams()`). Calling them without `void` is correct.

## Index maintenance

- 新規 memory 追加時は同一カテゴリ（Design / Admin / Architecture / Domain / Editor）にまとめて記載
- 廃止 memory は本 index から削除 + 物理 file 削除（index drift 防止）
- `.archive/` 行きは `ignored_memory_patterns` で自動除外、本 index には書かない
