---
description: 実装パターン — skill 未対応の domain-specific パターン集
paths:
  - "src/shared/domain/**"
  - "src/app/(admin)/**/_shared/actions/**"
  - "src/app/(public)/**/_shared/actions/**"
  - "prisma/schema.prisma"
  - "prisma/seed.ts"
---

# 実装パターン

> skill 化済みのパターンは CLAUDE.md の skill ポインタ参照（`add-prisma-enum` / `add-settings-field` / `create-admin-page` / `create-page-content` / `create-server-action` / `lexical-node` / `lexical-plugin` / `lexical-toolbar` / `parallax-section` / `upgrade-deps` / `split-action-file` / `worktree-bootstrap`）。

## 新規モデル / Seed

- **新規 Prisma モデル追加は `schema + seed + admin-ui` の 3 点セット同時作成必須** — seed 漏れは EmptyState で実装検証不可。enum フィールドは**全値を seed に網羅**
- **Seed 関数は `upsert` で idempotent 化 + `seedAll` / `seedDemo` 両方に登録** — `deleteMany + create` は `--demo` で既存破壊（`seedEmailTemplates` 参照）
- **Terms / News / Post / Section / Space の seed は Lexical JSON 同時保存必須** — `contentHtml` 単独禁止。`buildParagraphEditorStateJson()` + `buildParagraphHtml()`（`@/shared/lib/lexical/description-defaults.ts`）

## 公開一覧ページの 10 点セット

`create-page-content` skill 補足:

1. `page.tsx` + `loading.tsx` + `error.tsx`
2. `generatePageMetadata(slug)` + `BreadcrumbJsonLd`
3. `getPageSectionsWithFallback(slug)`
4. trailing sections から同種 + `cta` 除外
5. `default-page-sections.ts` + `SYSTEM_PAGES`
6. seed Page レコード
7. sitemap.ts
8. NavigationItem seed
9. E2E fixtures urls
10. layout.tsx `alternates`（該当時）

## Bulk action plan の標準 file 構造

リソースごとに **5 files create**：

- `src/shared/domain/<resource>/bulk-commands.ts`
- `src/app/(admin)/admin/(dashboard)/_shared/actions/<resource>/bulk.ts`
- `_components/<Resource>BulkActions.tsx`
- `__tests__/unit/domain/<resource>/bulk-commands.test.ts`
- `__tests__/integration/actions/admin/<resource>-bulk.test.ts`

**1-2 files modify**: `<Resource>Table.tsx` 行 checkbox / `<Resource>TableHeader.tsx` all-select。Bundle ごとに 1 commit、3 並列 dispatch 可能。

## Bulk command 戻り値型

- **Bulk status change command の戻り値型は `{ count, newStatus, affectedIds, rejectedIds }`** — Phase 1/2 の `{ count, isActive, affectedIds }` の superset。状態遷移マップ違反は early throw せず `rejectedIds` に積み bulk 自体は valid な ID のみ処理（非破壊）

## Bulk email SSoT

- **Bulk email 関数の SSoT 参照実装** — `sendEventCancelledToAllParticipants` (`@/shared/lib/email/event-emails.ts`) が canonical: `prisma.findMany` で対象取得 → `Promise.allSettled` 並列送信 → 失敗 per-item `logError`（category: `EXTERNAL_API`, severity: `MEDIUM`）→ bulk 自体は成功扱い。idempotency key は `<event-type>/<entity-id>(/<variation>)`

## Reader 関数 / Route Handler

- **Reader 関数を `"use server"` で export しない — Route Handler `route.ts` が公式推奨**（Next.js 16 backend-for-frontend ガイド）。canonical: `checkAdminAuth` (401) / `checkPermission` (403, `request.headers` を第 3 引数で渡す) + `NextResponse.json` + `AbortSignal.timeout` + zod `safeParse` + `jsonError` / `jsonValidationError`。参照実装: `src/app/(admin)/admin/api/{ogp,notifications/unread-count}/route.ts`

## UX スケール判断

- **UX スケール判断は seed 件数ではなく CMS 運用上限で** — Location / Category / Tag 等運用者が追加できるリソースは production 想定値（数十〜100）で設計。フィルタ UI 閾値目安: pill 2〜5 / scroll 6〜15 / dropdown 16+

## Per-slug cache invalidation

- **Per-slug cache invalidation 配線は domain command 戻り値拡張駆動** — `updateXCommand` / `createXCommand` の戻り型を `{ id }` → `{ id, slug }` 拡張し、Server Action `afterSuccess(data) => updateTag(getCacheTag.X.detail(data.slug))` で per-slug + ベースタグ両方を invalidate。`MutationResult<T>` 戻り型 + test mock fixture も同一 commit で同期 cascade 必須。slug 取得のための afterSuccess 内追加 query は禁止（execute 戻り値で完結）

## Reactive form sub-card

- **Reactive form sub-card（score card / live preview）は Form 内部 Tabs で `form.control` 共有** — page.tsx に Tabs を配置 + Form / SubCard を別子要素にすると `FormProvider` 必須で複雑化。Tabs を Form component 内部に配置すれば `form.control` を直接子に渡せて `FormProvider` 不要。`forceMount` + `data-[state=inactive]:hidden` で Radix Tabs の SC children preservation も維持

## Feature toggle 粒度

- **Feature toggle 粒度** — 単一 tenant は per-entity 単一層、multi-tenant template は `Settings.xxxEnabledGlobal` + `Entity.xxxEnabled` の 2 層（precedence: Global OFF → 常に非表示 / Global ON → per-entity 効く）。参照: `Settings.reviewsEnabledGlobal` ↔ `Space.reviewsEnabled`

## Lexical 新規ノード（バリアント選択 UI）

- **Lexical 新規ノードで作成時バリアント選択 UI が必要な場合** — dialog-upfront 3 コマンド体制（`OPEN_XXX_DIALOG_COMMAND` / `INSERT_XXX_COMMAND` / `UNGROUP|TRANSFORM_XXX_COMMAND`）。全 UI 経路（Insert / FT / ⋮⋮ / keyboard）は dispatch 前に `$getSelectionBlockNodes()` のキーをスナップショットして payload に積む（ダイアログフォーカスで editor 選択が失われるため必須）。hardcoded default 値の silent 挿入禁止。参照実装: `GroupPlugin`

## UI デザイン探索

- **UI デザイン探索は `src/app/(public)/<feature>-demo/` で複数バリアント比較** — `hero-demo/` / `spaces-design-demo/` が参照実装。上部 sticky nav で variant 切替 + `max-w-[420px]` wrapper で desktop でも mobile preview 可能。`shared.ts` に variant metadata（name / tagline / description / pros / cons）を SSoT 化

## 管理画面 table 行クリック

- **管理画面 table 行クリック遷移は `ClickableTableRow`（`@/admin/components/table`）+ `stopRowClick` 経由必須** — `<tr>` への `position: relative` は CSS 仕様 undefined behavior、複数 `<td>` を単一 `<a>` で包むのが HTML 仕様禁止。第二推奨（`tabIndex={0}` + `onKeyDown(Enter)` + `aria-label`）を `ClickableTableRow` に集約済（→ `frontend/admin-ui/tables.md`）

## typedRoutes + router.push template literal

- **Next.js 16 typedRoutes + `router.push(template literal)` の library boundary cast** — `typedRoutes: true` 環境では `${string}` template literal を `Route<string>` 型に narrow できない（公式制約）。helper component（`ClickableTableRow` 等）で href を受ける場合、**公開 API は `string`、内部の `router.push` 呼び出しで `as Route<string>` cast を 1 箇所に閉じ込める**

## 「推奨で」「クリーン実装」変換セット

「推奨で」「クリーン実装」指示時の変換セット：

1. nuqs `parseAsString.withDefault` → `parseAsStringLiteral(values)` + `isValid*` 型ガード
2. 複合 `sort` → `sortBy` + `sortOrder` + `SortableColumnHeader`
3. 手動 debounce → `useDebouncedCallback`（`@/admin/hooks`）
4. Select `onValueChange` `as` → `isValid*` narrow
5. 同系統テーブルと Grep 比較

## Plan 型 contract 削減禁止

- **Plan 記載の型 contract（`select` clause / `interface` fields）は implementer 独自判断で削減しない** — JSON-LD / SEO / UI 価値に影響する重要 field（`businessHours` / `amenities` / `specialHolidays` 等の SEO data source）を plan の型から省くと後段 Task で出力欠落の cascade。implementer は型を最小化する場合 BLOCKED でも DEVIATION でもなく **controller への確認** で escalate

## handoff memory chore commit bundle

- **handoff memory の「次セッション判断ポイント」は controller 判断で plan 範囲外の追加 chore commit を bundle 化** — 前セッションが「軽量実装 → 次セッション判断」と残した課題は、新セッションで本体 Task 着手前に **Task X.5 として独立 chore commit** を bundle に挟むのが最速

## 50+ 行範囲削除

- **50+ 行・複数 describe block の範囲削除は Edit tool より Python regex.sub が信頼性高い** — Edit は old_string の正確マッチを要求。`python3 -c "import re; ...; pattern = re.compile(r'<start_marker>.*?<end_marker>', re.DOTALL); new_text, count = pattern.subn('', text); ..."` で範囲指定削除する方が安全 + 1 回で済む。判定基準: ① 削除範囲が 50 行超 ② 開始・終了の独自 marker あり ③ 単一 file 単一 block

## plan archive

- **完了済み plan / spec は `docs/superpowers/{plans,specs}/.archive/<year>/` 配下に保管** — 各 archive file 冒頭に `> **Snapshot: YYYY-MM-DD** — Implementation completed, archived as historical reference.` 追記。判定: ① plan 内 commit SHA が main で実在 ② plan の最終 task 完了済 ③ 実装が main に存在
