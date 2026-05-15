# Serena Project Memory

> Topic-specific findings cataloged here for cross-session reuse via Serena `read_memory`.
> Configuration SSoT: `.serena/project.yml`.
> Stale point-in-time audits は `.archive/2026-Q1/` に物理保管。`ignored_memory_patterns: ["_archive/.*"]` で `list_memories` 出力から自動除外。

## Active memory files

### Design

- `design-system.md` — Editorial Magazine + Kinfolk/Cereal 系統 typography scale + OKLCH カラー割合 + spatial / motion design SSoT。`.claude/rules/frontend/project-design-config.md` の補完（reference URLs / OKLCH 値 / clamp ピクセル換算表 / forbidden patterns 解説）

## SSoT delegation policy

設計判断・実装パターン・コード規律は `.claude/rules/**/*.md`（path-scoped auto-load）と `CLAUDE.md` を SSoT とする。Serena memory は以下の補完に限定:

- ブランド方針 / reference URLs / 視覚的な reference data（rule docs に書くと冗長）
- LSP query で symbol を引いた後の overview / context（Serena の native 用途）

## Confirmed false-positives (carry across sessions)

1. `api-keys.ts` catch blocks `} catch {` without error binding — valid TS5.x syntax, NOT empty catch. They return `createMutationError()`.
2. `google-calendar.ts` / `stripe.ts` connection-test actions use custom return types (`Promise<{ success: boolean; ... }>`), NOT `MutationResult`. Intentional for richer test response shape.
3. Lexical plugin color swatches (`bg-yellow-300` etc.) in `HighlightPlugin.tsx` / `TextColorPlugin.tsx` are explicitly allowed by `tailwind-patterns/theme-tokens.md` exception.
4. Section validation schemas (`section.ts`, `section-design.ts`) use `.default('md')` etc. on local `as const` arrays — NOT Prisma enum defaults. Correct pattern.
5. `CouponForm.tsx` / `CustomerForm.tsx` client-side handlers return `{ success, message }` shaped objects — these are NOT Server Actions, they are client form handlers.
6. `setView()` / `setStatusFilter()` / `setCategory()` in CalendarToolbar/PostFilters are wrapper functions (internally use `void setParams()`). Calling them without `void` is correct.

## Index maintenance

- 新規 memory 追加時は `.claude/rules/**` で代替できないか先検討（SSoT 二重化を避ける）
- Snapshot / dated analysis は `.archive/` 配下に置く（list_memories 自動除外）
- 廃止 memory は本 index から削除 + 物理 file 削除（drift 防止）
