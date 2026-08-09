# 公開イベント一覧の検索性向上 + EventCategory 新設 設計

- 日付: 2026-07-23
- ステータス: 承認待ち (brainstorming 完了、writing-plans 前)

## 背景

イベント管理者から「過去のイベントや未来のイベントを簡単に探せるようになるといい」という要望が出た。当初は「イベントの種類・カテゴリーを作るべきか」という質問だったが、対話の中で真の目的は「過去にこんなイベントがあったと知ってもらい、電話・問い合わせでの再開催確認や、そこから未来のイベントへの導線につなげたい」という、閲覧→問い合わせ変換のための発見しやすさであることが分かった。

調査の結果、**管理画面 `/admin/events`（イベント管理）側は既に「開催」「終了」タブ + 期間指定 + キーワード検索が実装済み**であり、この画面には変更不要と確認済み（ユーザー承認済み）。ギャップは**公開 `/events`** 側にのみ存在する。公開側は月別カレンダーの前月/次月ボタンのみで、検索・タブ・カテゴリー絞り込みが一切ない。

有名事例調査（Peatix 主催者ページ）でも「開催予定/過去のイベントタブ切り替え + キーワード検索 + カテゴリー等の絞り込み」が標準パターンであることを確認した。これは本リポジトリの admin 側が既に採用している open/past タブ設計と同型であり、公開側にも同じ考え方を適用する。

ユーザーは検討の結果カテゴリー軸（Approach B: タブ + 検索 + カテゴリー）を選択し、「不明な点を作らず調べて検証し、良ければ公式推奨で後方互換性のないクリーンな実装」を明示的に指示した。

## 調査で確定した事実 (前提)

### 現状の Event モデル (`prisma/schema.prisma:2151-2230`)

- カテゴリー・種類に相当するフィールドは存在しない。`format`（OFFLINE/ONLINE/HYBRID）は開催方式、`status`（DRAFT/PUBLISHED/CANCELLED/ARCHIVED）はライフサイクル区分であり、どちらも「イベントの種類」ではない。
- `firstSlotStartAt`/`lastSlotEndAt` という非正規化カラムが既に存在し、スキーマのコメントに「開催が近い順」「終了が遅い順（past タブ既定）」という **公開側の開催予定/終了タブを見越したコメントが既に書かれている**（実装は未着手）。

### admin `/admin/events` は変更不要（確認済み・ユーザー承認済み）

- `getEvents(options: GetEventsOptions)`（`src/shared/domain/events/admin-queries.ts:159`）が `search`/`status`/`tab`（open/past/draft/cancelled/all）/`dateFrom`/`dateTo`/`sortBy`/`sortOrder`/pagination を全てサポート済み。
- UI (`EventTabs.tsx`, `EventFilters.tsx`) も完全に配線済み。この画面には手を入れない。

### 公開 `/events` の現状アーキテクチャ

- `/events` は「Page-Template Architecture」（`src/app/(public)/events/page.tsx`）で、`searchParams` を一切受け取らず `SectionStack` に forward していない（コメントに「filter / 中間挿入 / SiteCTA なし」と明記）。対して `/spaces`（`src/app/(public)/spaces/page.tsx`）は `searchParams` を受け取り `SectionStack` に forward している。
- `EVENT_CALENDAR` セクション（`src/app/(public)/_components/EventCalendarSection.tsx`）は `displayLayout` config（list / calendar / calendar-list-toggle）で 3 variant を dispatch する。データ取得は `getPublishedEvents()`（`src/shared/domain/events/public-queries.ts:83`、引数なし・`'use cache'`）で PUBLISHED 全件を一括取得し、props として子へ渡す設計。
  - `list` variant（`event-list-view.tsx`）: 月ごとに `events.filter(eventHasSlotInJSTMonth)` でクライアント側フィルタし、`MonthPicker` で月送り。検索・タブ・カテゴリーは無い。
  - `calendar` variant（`event-calendar-view.tsx`）: 月グリッド表示。同じく月送りのみ。
  - 両 variant とも DB レベルのページネーションは持たない。

### `/spaces` の実装パターン（直近 PR #1400-1402、本設計のテンプレート）

- `src/shared/domain/spaces/public-queries.ts`: `getPublishedSpacesPaginated(input)`（`'use cache'`、低カーディナリティ facet 専用）と `getPublishedSpacesPaginatedWithAvailability(input, range)`（`'use cache'` なし、時間帯 facet 使用時の dynamic bypass）の 2 経路が併存。
- nuqs: `src/app/(public)/_shared/lib/search-params.ts` の `spaceSearchParamsParsers`（`q`/`category`/`location`/`page` 等）。`categoryId` 相当の単一選択 facet は **`null` sentinel**（admin の空文字 sentinel とは異なる）。
- クライアント: `filter-bar.tsx` が `useQueryStates(parsers, {history:"replace", shallow:false})`、facet 変更時に `page:1` を同時セット。
- サーバー: `section-renderer.tsx` の `SPACE_LIST` catalog 分岐が `await spaceSearchParams.parse(searchParams)` → filter オブジェクト構築 → データ取得、という配線。

### 既存カテゴリーモデル 3 種の比較（EventCategory 設計の根拠）

| モデル          | id   | 削除方式                                        | 一意性制約                                               | SEOフィールド                                                              | Event 側の FK 必須性                  |
| --------------- | ---- | ----------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------- |
| `SpaceCategory` | uuid | `isActive` soft-delete + `_count` ガード        | `@@unique([name], where: {isActive:true})` partial index | なし                                                                       | `Space.categoryId` は任意（nullable） |
| `PostCategory`  | uuid | 物理削除（`onDelete: Restrict` で使用中は不可） | 素の `@unique`                                           | あり（slug/metaTitle/metaDescription/ogpImageUrl、公開アーカイブページ用） | `Post.categoryId` は必須              |
| `FaqCategory`   | uuid | `deletedAt` soft-delete                         | `@@unique([slug], where: {deletedAt:null})`              | 一部                                                                       | -                                     |

`FaqCategory` のスキーマには「slug が無条件 `@unique` だと soft-delete 済みカテゴリーが再作成をブロックし続け、`ensureFaqCategoryUnique` の判定条件（`deletedAt:null`）と DB 制約が非対称になって P2002 が生の形で漏れた」という既知バグの修正コメントがある。**partial unique index は必ずドメイン層の一意性チェックと同じ「有効」条件でスコープする**という教訓を EventCategory にも適用する。

3 モデルとも **id は uuid で統一**されている（`Event` 自身は `cuid()`/`VarChar(30)` だが、これは Event 集約自身の規約であり、カテゴリーモデル群の規約ではない）。

## 外部検証（公式ドキュメント、Context7 経由で一次情報確認）

### Next.js: 高カーディナリティな検索条件に `'use cache'` は使わない

- `use-cache-remote.mdx`（"Optimizing Remote Cache Keys with Category-Based Caching"）: category のような低カーディナリティ次元のみキャッシュキーに含め、価格帯フィルタのような高カーディナリティ次元は「メモリ内でフィルタする」か「動的処理に回す」ことが公式に明記されている。
- `caching.mdx`（"Streaming uncached data"）: 「リクエストごとに新鮮なデータが必要なコンポーネントには `use cache` を使うな。`<Suspense>` で包め」と明記。
- `layouts-and-pages.mdx`: 「Server Component page で `searchParams` prop を読むこと自体が dynamic rendering を有効化する」と明記。
- **本リポジトリ自身の既存コメント**（`src/shared/domain/events/public-queries.ts` の `getUpcomingEventsExcluding()`）にも「`'use cache'` 非対応（`new Date()` を使うため呼び出し側が動的スコープ必須）」という規約が既に成文化されている。「開催予定/終了」タブはまさに現在時刻相対の分類であり、同じ性質を持つ。
- **結論**: 新設する一覧取得関数（`getPublishedEventsPaginated`）は `'use cache'` を付けず、`Suspense` + `await connection()` の通常の dynamic fetch にする。カテゴリー一覧（低カーディナリティな参照データ）のみ `'use cache'` + `cacheTag` の対象にする。

### Prisma: 必須 FK 追加は公式に 3 段階 expand/contract

- `handleEvaluateDataloss.ts`（Prisma 本体ソース）: 既存データ入りテーブルへの default 値なし required column 追加は "unexecutable step" として通常の `migrate dev` では拒否され、`--create-only` でファイルだけ生成し手動編集するよう案内される。
- `customizing-migrations` 公式ページ: まさに 1:多の必須リレーション追加の実例（`profileId` 列）が SQL 付きで掲載されており、(1) nullable で `ADD COLUMN` → (2) `UPDATE` で backfill → (3) `ALTER COLUMN ... SET NOT NULL` + `ADD FOREIGN KEY`、という手順が明文化されている。
- **結論**: この 3 段階を `prisma/migrations/<timestamp>_add_event_category/migration.sql` に実装する。

### breaking migration 判定（本リポジトリ固有、一次情報で確認済み）

- `.github/workflows/deploy-production.yml:357` の grep 正規表現は `DROP COLUMN`/`RENAME COLUMN`/`RENAME TO`/`DROP TABLE`/`DROP TYPE` に加えて **`ALTER COLUMN ... SET NOT NULL` と `ALTER COLUMN ... TYPE` も検知対象**に含む（CLAUDE.md・`.claude/rules/migrations.md` の簡略な列挙にはこの 2 つが記載されていないが、`.claude/rules/deploy-infra.md` と実装・回帰テスト `__tests__/unit/architecture/breaking-migration-detection.test.ts` は正しく網羅している — ドキュメント間の軽微な drift であり実装は正しい）。
- 過去の実例 `prisma/migrations/20260714111408_add_space_rate_plan/migration.sql` が同型の 3 段階 backfill + `SET NOT NULL` を実装しており、この migration は breaking 判定を受けている。
- **確定事実**: 今回の `Event.categoryId` NOT NULL 化は、3 段階を 1 ファイルにまとめても複数 PR に分けても、`SET NOT NULL` を含む変更が変更ファイル一覧に入った時点で必ず breaking migration 判定を受け、public/admin 両 Cloud Run サービスが `scaling=0` で約 310 秒 drain してから適用される計画ダウンタイムデプロイに自動切替される。これは回避不可能な設計上の挙動であり、バグではない。
- **ユーザー確認済み**: この計画ダウンタイムを許可する（2026-07-23 の対話で明示承認）。

### squawk lint（`.squawk.toml` 実読済み）

- 有効ルール: `ban-drop-column` / `ban-drop-table` / `ban-drop-database` / `renaming-column` / `renaming-table` / `changing-column-type` / `adding-not-nullable-field` / `adding-required-field` / `syntax-error`。
- `adding-foreign-key-constraint` は `excluded_rules` で無効化済み → FK 追加文に `squawk-ignore` は不要。
- `adding-not-nullable-field` は有効 → `ALTER COLUMN "categoryId" SET NOT NULL` の直前 1 行に `-- squawk-ignore adding-not-nullable-field` が必要（`prisma/migrations/20260714111408_add_space_rate_plan/migration.sql` に前例あり、複合 `ALTER TABLE` は列ごとに文を分割して個別に付す）。

## ゴール

1. 公開 `/events` で「開催予定 / 終了」タブを切り替えられる。
2. キーワード検索（タイトル・本文）で過去/未来のイベントを見つけられる。
3. `EventCategory` を新設し、カテゴリーで絞り込める。
4. 上記を通じて、閲覧 → 問い合わせ → 再開催確認 / 未来のイベントへの導線を強化する（既存の `thumbnailUrl`/`gallery` を活かしたカード表示を維持）。
5. 管理画面にカテゴリー管理 CRUD 画面を追加し、イベント作成・編集フォームでカテゴリー選択を必須にする。

## 非ゴール（スコープ外）

- **`/admin/events`（イベント管理画面）の変更**: 既に開催/終了タブ・期間指定・検索が実装済みと確認済み。ユーザーも「現状でよさそう」と明言。
- **カテゴリー専用の公開アーカイブページ**（`/events/category/xxx` のような SEO 付き専用 URL）: 想定される主な用途は `/events` 上のフィルタ facet のみ。`PostCategory` 型の SEO フィールド（slug/metaTitle/metaDescription/ogpImageUrl）は持たない。
- **`calendar`（月グリッド）variant へのタブ/検索/カテゴリー適用**: 月ナビで「今月何があるか」を見渡す用途は現状維持。タブ・検索・カテゴリーは `list` variant にのみ適用する。
- **カテゴリーの多階層化・複数カテゴリー同時付与**: 単一選択・単一階層（`SpaceCategory` と同型）。

## アーキテクチャ設計

### 1. データモデル（Prisma DSL）

`SpaceCategory` を 1:1 で踏襲する（id 型・soft-delete 方式・一意性制約の形まで含む）:

```prisma
model EventCategory {
  id          String   @id @default(uuid()) @db.Uuid
  name        String
  description String?  @db.Text
  icon        String?
  color       String?
  sortOrder   Int      @default(0)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  events Event[]

  @@unique([name], map: "event_categories_name_active_key", where: { isActive: true })
  @@unique([sortOrder], map: "event_categories_sortOrder_key")
  @@index([sortOrder])
  @@map("event_categories")
}
```

`Event` モデルへの追加（必須 FK、`PostCategory` 型の requiredness）:

```prisma
model Event {
  // ... 既存
  categoryId String        @db.Uuid
  category   EventCategory @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  // ...
  @@index([categoryId])
}
```

`onDelete: Restrict` により、イベントが紐づくカテゴリーは物理削除・非アクティブ化ともに `_count` ガードで防ぐ（`SpaceCategory` の `deleteSpaceCategory`/`updateSpaceCategoryActive` と同じガード条件を踏襲）。

### 2. Migration（3 段階 expand/contract、1 ファイルにまとめる）

`prisma/migrations/<timestamp>_add_event_category/migration.sql`（`prisma migrate dev --name add_event_category --create-only` で生成後、手動編集）:

```sql
-- (1) 新規テーブル作成（squawk 抵触なし）
CREATE TABLE "event_categories" ( ... );

-- (2) デフォルトカテゴリー行を用意（既存 Event の backfill 先）
INSERT INTO "event_categories" ("id", "name", "sortOrder", "isActive", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), '未分類', 0, true, now(), now());

-- (3) categoryId を nullable で追加（squawk 抵触なし）
ALTER TABLE "events" ADD COLUMN "categoryId" UUID;

-- (4) 既存行を「未分類」カテゴリーへ backfill（DDL ではないため squawk 対象外）
UPDATE "events" SET "categoryId" = (SELECT "id" FROM "event_categories" WHERE "name" = '未分類' LIMIT 1)
WHERE "categoryId" IS NULL;

-- (5) NOT NULL 化（breaking migration 検知の起点。squawk-ignore 必須）
-- squawk-ignore adding-not-nullable-field
ALTER TABLE "events" ALTER COLUMN "categoryId" SET NOT NULL;

-- (6) FK 制約追加（adding-foreign-key-constraint は除外ルールのため squawk-ignore 不要）
ALTER TABLE "events" ADD CONSTRAINT "events_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "event_categories"("id") ON DELETE RESTRICT;

CREATE INDEX "events_categoryId_idx" ON "events"("categoryId");
```

適用後 `bun run db:generate`。この migration は breaking migration 判定を受けるため（前掲の外部検証節を参照）、push 前にユーザーへ最終確認する（本設計フェーズで一度承認済みだが、実装 PR を作る段階で改めて明示する）。

### 3. 管理画面: カテゴリー CRUD（`SpaceCategory` を 1:1 でミラー）

確認済みの実ファイル対応（`space-categories`/`space-category` を `event-categories`/`event-category` に置換）:

| 役割                 | SpaceCategory（既存・ミラー元）                                                                                                           | EventCategory（新規）                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| ドメインコマンド     | `src/shared/domain/space-categories/commands.ts`                                                                                          | `src/shared/domain/event-categories/commands.ts`                                  |
| Zod スキーマ         | `src/shared/lib/validations/space-category.ts`                                                                                            | `src/shared/lib/validations/event-category.ts`                                    |
| Server Action        | `src/app/(admin)/admin/(dashboard)/_shared/actions/space-category.ts`                                                                     | `.../_shared/actions/event-category.ts`                                           |
| Admin queries        | `src/app/(admin)/admin/(dashboard)/_shared/queries/space-category.ts`                                                                     | `.../_shared/queries/event-category.ts`                                           |
| 管理画面 UI          | `src/app/(admin)/admin/(dashboard)/space-categories/_components/{CategoryForm,CategoryTable,CreateCategoryDialog,CategoryActionCell}.tsx` | `.../event-categories/_components/{同名}.tsx`                                     |
| Event フォーム内タブ | `spaces/_components/CategoryTabContent.tsx`（`SpaceEditForm` 内）                                                                         | `events/_components/CategoryTabContent.tsx`（`EventForm` 内、必須 select として） |

コマンド層は `ensureNameAvailable`（`findFirst` + `isActive:true` スコープの一意性チェック）、`create`（`buildOrderScopeLockSql` advisory lock 下で末尾採番）、`updateOrder`（`buildUuidOrderSqlFragments` の 2 段 UPDATE）、`delete`/`updateActive`（`_count.events` ガード）を `SpaceCategory` からそのまま移植する。

Server Action は `executeAdminMutationResult({ resource: "eventCategory", ... })` + `afterSuccess: () => invalidateSiteWideCache(CACHE_TAGS.EVENT_CATEGORIES)` のパターンを踏襲する。`"eventCategory"` を `src/shared/lib/admin-resources.ts` の Resource union に追加する（`"event"` は既存だが `"eventCategory"` は新規）。

`CACHE_TAGS.EVENT_CATEGORIES` を `src/shared/lib/constants/cache.ts` に `SPACE_CATEGORIES` と同型で新設し、`NEXTJS_TAG_TO_CDN_TAG` マッピング（またはドメイン非該当なら allowlist 明記）を追加する（`add-cache-tag` skill 手順に従う）。

### 4. イベント作成・編集フォームへの必須 select 統合

`Event.categoryId` は必須のため、`event-form-schema.ts` の `locationId`/`spaceId` が使う `EVENT_FORM_NONE_VALUE` sentinel 方式は使わない。代わりに `Space.locationId`（必須 uuid select）のパターンを踏襲する:

- `event-form-schema.ts`: `categoryId: z.string().min(1, { error: "カテゴリーを選択してください" }).pipe(z.uuid({ error: "カテゴリーIDが無効です" }))` を追加。
- `EventForm.tsx`: `locationId`/`spaceId` と同様に controlled state・hidden input・`defaultValue` 配線・`categories` prop を追加。配置タブは会場と無関係なため `basic` タブ（`EventBasicFields.tsx`、title/slug と並べて配置）。
- UI: `SpaceEditForm.tsx` の `locationId` select（`{...(categoryId !== "" ? { value: categoryId } : {})}` という条件付き value スプレッドで Radix の空文字予約値問題を回避、sentinel 不使用）と同じ実装。
- `src/shared/domain/events/admin-queries.ts`: `getCategoriesForEvent()` を新設（`prisma.eventCategory.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } })`）。`eventListSelect`/`eventDetailSelect` に `categoryId`（一覧表示するなら `category: { select: { id, name } }`）を追加。
- `src/shared/domain/events/commands.ts`: `CreateEventInput`/`UpdateEventInput` 型と prisma `data` 組み立てに `categoryId` を追加。
- `events/new/page.tsx`・`events/[id]/edit/page.tsx`: `getCategoriesForEvent()` を `Promise.all` に追加し `<EventForm categories />` へ配線。

### 5. 公開 `/events` アーキテクチャ変更（クリーン実装・後方互換なし）

**ページ**: `events/page.tsx` に `searchParams` パラメータを追加し `SectionStack` に forward する（`spaces/page.tsx` と同型）。

**セクション**: 既存 `EVENT_CALENDAR` セクションを拡張する（新規セクション type は作らない — `space-list` の catalog variant が既存セクションの拡張として実装された直近の precedent に倣う）。

- `list` variant: 「一括 fetch（`getPublishedEvents`、引数なし・`'use cache'`）→ props」設計を廃止し、`section-renderer.tsx` の `EVENT_CALENDAR` ケースで `searchParams` を parse → 新設 `getPublishedEventsPaginated(filter)`（`'use cache'` なし、`Suspense` + 既存の `await connection()` 済みスコープ内で直接 await）を呼ぶ設計に置き換える。月送り (`MonthPicker`/`CalendarMonthNav`) は list variant から撤去する（タブ + 検索 + カテゴリー + 日付順ページネーションが月ナビを代替するため）。
- `calendar` variant: 現状維持（月グリッド、月送りのみ、フィルタ非適用）。データ取得は既存の `getPublishedEvents()`（引数なし・`'use cache'`）のまま。
- `calendar-list-toggle` variant: **2 種類のデータ取得が必要になる点に注意**。現状は `EventsViewSwitcher` が `listView`/`calendarView` 双方に同一の一括取得データを渡す構成だが、list 側が `getPublishedEventsPaginated`（フィルタ・ページング済み）、calendar 側が `getPublishedEvents`（月グリッド用の全件）を必要とするため、性質が異なる 2 つのデータセットになる。`section-renderer.tsx` の `EVENT_CALENDAR` ケースは `config.displayLayout` で分岐し、`list` のみなら paginated 取得のみ、`calendar` のみなら bulk 取得のみ、`calendar-list-toggle` なら両方を実行して `EventsViewSwitcher` へそれぞれ渡す（無駄なクエリを避けるため displayLayout 単位で必要な方だけ実行する）。
- `EventCalendarConfig`（`src/shared/lib/sections/definitions/event-calendar/schema.ts`）の `showPastEvents` boolean は**廃止**する。閲覧者向けの `upcoming`/`past` タブに機能が吸収されるため、運営者側トグルは冗長になる。

**nuqs**: `src/app/(public)/_shared/lib/search-params.ts` に既存 `eventsSearchParamsParsers`（`view`/`y`/`m`、月送り専用・client-only・`shallow:true`）とは別オブジェクトとして新設する:

```ts
export const EVENT_LIST_TABS = ["upcoming", "past"] as const;
export type EventListTab = (typeof EVENT_LIST_TABS)[number];
const eventListTabSet = new Set<string>(EVENT_LIST_TABS);
export function isEventListTab(value: string): value is EventListTab {
  return eventListTabSet.has(value);
}

export const eventsListSearchParamsParsers = {
  tab: parseAsStringLiteral(EVENT_LIST_TABS).withDefault("upcoming"),
  q: parseAsString.withDefault(""),
  categoryId: parseAsString, // 未指定 = null = "すべて"（spaceSearchParamsParsers.category と同型）
  page: parseAsInteger.withDefault(1),
};
export const eventsListSearchParams = createSearchParamsCache(
  eventsListSearchParamsParsers,
);
```

> **実装時の訂正**: 上の例示コードのうち `EVENT_LIST_TABS` / `EventListTab` /
> `isEventListTab` は `src/app/(public)/_shared/lib/search-params.ts` ではなく
> **`src/shared/domain/events/event-list-tab.ts`（shared 側）** に置いた。依存方向は
> `app → shared` の一方向で `src/shared/domain/*` から `src/app/(public)/*` を
> import できないため、shared からも参照する型を app 配下に定義すると依存が逆流する
> （`src/shared/domain/spaces/space-sort.ts` と同型の配置理由）。
> `search-params.ts` は shared からの re-export のみを持つ。

クライアント側（新設する events 版 filter bar コンポーネント）は `useQueryStates(eventsListSearchParamsParsers, {history:"replace", shallow:false})`。facet 変更時は `page:1` を同時セット。**タブ切替時は `q`/`categoryId` を保持する**（`filter-bar.tsx` が個別 facet 変更時に他 facet を保持する既存流儀を踏襲。admin `EventTabs.tsx` の全リセット方式とは意図的に異なる — 公開側は「タブも 1 つの facet」という一貫したメンタルモデルにする）。

**データ取得**: `src/shared/domain/events/public-queries.ts` に新設:

```ts
export async function getPublishedEventsPaginated(filter: {
  tab: EventListTab;
  q: string;
  categoryId: string | null;
  page: number;
}) {
  // 'use cache' なし。await connection() 済みスコープ内から呼ぶ。
  // tab: "upcoming" → slots.some(endAt >= now) / "past" → NOT slots.some(endAt >= now)
  // q: title ILIKE（既存 events_title_trgm_idx を活用）
  // categoryId: 完全一致
  // status: PUBLISHED, deletedAt: null は既存 getPublishedEvents と同じ
  // ページング: paginate({page, limit}) + Promise.all([findMany, count])
}
```

カテゴリー選択肢（フィルタ UI 用）は低カーディナリティな参照データのため、`getActiveEventCategories()` を `'use cache'` + 新設 `cacheTag(CACHE_TAGS.EVENT_CATEGORIES)` で取得する。

### 6. UI コンポーネント

イベント一覧用の新規 filter bar（`src/app/(public)/_components/event-calendar/` 配下、例: `event-list-filters.tsx`）を新設する。`/spaces` の `filter-bar.tsx` とは異なり facet が 3 つ（タブ・検索・カテゴリー）のみのため、Dialog は使わず横並びの常時表示バーにする（タブ=ボタン群、検索=Input、カテゴリー=Select）。`EventCard`（既存）はカテゴリーバッジ表示を追加する。

### 7. キャッシュ戦略まとめ

| データ                                                                | 方式                                                                                             |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `getPublishedEventsPaginated`（一覧本体、tab/q/categoryId/page 依存） | `'use cache'` なし。Suspense + `await connection()`                                              |
| `getActiveEventCategories`（フィルタ選択肢）                          | `'use cache'` + `cacheTag(CACHE_TAGS.EVENT_CATEGORIES)` + `cacheLife(CACHE_LIFE.PUBLIC_CONTENT)` |
| 既存 `getPublishedEventBySlug`（詳細ページ）                          | 変更なし（引数 slug は 1 件specificで低カーディナリティ、現状のまま）                            |
| 既存 `getUpcomingEventsExcluding`（関連イベント表示）                 | 変更なし                                                                                         |

## テスト方針

### unit (`__tests__/unit/`)

- `event-categories/commands.test.ts`: `ensureNameAvailable` の `isActive` スコープ一意性、`create` の advisory lock 採番、`updateOrder` の 2 段 UPDATE、`delete`/`updateActive` の `_count.events` ガード（`SpaceCategory` の既存テストと同型）。
- `public-queries.test.ts` への追加: `getPublishedEventsPaginated` の tab（upcoming/past 境界値、slot 未登録イベントの扱い）・q（ILIKE 部分一致）・categoryId（完全一致）・page のケース。
- `search-params.test.ts` への追加: `eventsListSearchParamsParsers` のデフォルト値・`isEventListTab` type guard。

### integration (`__tests__/integration/`)

- カテゴリー CRUD の Server Action 経路（create/update/delete/updateActive/updateOrder）を実 DB で確認。
- `EventCategory` に紐づく `Event` がある状態での削除・非アクティブ化が `CONFLICT` で拒否されることを確認。
- migration 適用後、既存 seed イベントが「未分類」カテゴリーに backfill されていることを確認。

### e2e (`e2e/`)

- 公開 `/events` でタブ切替・検索・カテゴリー絞り込みが URL に反映され、結果が変わることを確認する smoke spec。
- 管理画面でのカテゴリー CRUD・イベント作成時のカテゴリー必須選択（未選択で送信 → バリデーションエラー）を確認する spec。
- `prisma/seed.ts` に `EventCategory` の初期データ（例: 「未分類」に加えて数件のサンプル）を追加し、`e2e/fixtures/test-data.ts` の該当 fixture を同時更新する。

### drift gate (`__tests__/unit/architecture-boundaries.test.ts` ほか)

- `THIN_ADMIN_ACTION_FILES` 配列に `event-category.ts` を追記（Prisma 直 import 禁止チェック対象化、追記しなくてもテスト自体は落ちないが drift 防止のため追記する）。
- 新規 `CACHE_TAGS.EVENT_CATEGORIES` に producer（`getActiveEventCategories`）が存在することを `add-cache-tag` skill の drift gate で確認。
- `event-calendar` セクションの config schema から `showPastEvents` を削除した場合、`__tests__/unit/architecture-boundaries.test.ts` の rootTargets（PortableTextBlock[] 化対象フィールド一覧）には影響しない（`showPastEvents` は対象外のため）。ただし `__tests__/unit/domain/sections/registry.test.ts` 等の別ファイルで event-calendar の config schema 定義数・デフォルト値検証が壊れないか確認する。

## 実装上の注意

### breaking migration（最重要・ユーザー承認済み）

`Event.categoryId` の NOT NULL 化により、実装 PR の push 時に public/admin 両サービスが `scaling=0` で約 310 秒 drain してから適用される計画ダウンタイムデプロイに自動切替される。深夜等の影響が少ない時間帯のデプロイを推奨する。3 段階に分割しても `SET NOT NULL` を含む回で必ず発火するため、`add_space_rate_plan` の前例同様、1 migration ファイルにまとめて一括適用する方が実装コストが低い。

### 既存コードの削除・置換

- `event-list-view.tsx`/`event-calendar-view.tsx` から list variant 用の月送り UI（`CalendarMonthNav`/`MonthPicker`/`useCalendarMonth`）を list 側から除去（calendar variant では維持）。
- `EventCalendarConfig` から `showPastEvents` フィールドを削除。既存の DB 上の Section.config JSON に残存する `showPastEvents` キーは、`safeParse` の `.default()`/`.prefault()` 契約により無視される（sections.md の契約通り、余分なキーはエラーにならない）。

### JST・時刻境界

`tab` の upcoming/past 判定は既存 admin の `buildTabWhere` と同じ考え方（`slots.some(endAt >= now)`）を使うが、`now` は `await connection()` 経由の動的スコープ内で都度取得する（`'use cache'` 内で `new Date()` を呼ばない）。

### 型安全・enum

`EventListTab`（`"upcoming" | "past"`）は TS の `enum` ではなく readonly tuple + `Set` ベースの type guard（既存 `EVENT_VIEWS`/`isEventView`, `MYPAGE_EVENT_TABS`/`isMypageEventTab` と同型）。`erasableSyntaxOnly` 制約により TS `enum` は使えない。

## 破壊的変更の一覧（最終確認用）

| 変更                                                         | 影響                                                                                                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `Event.categoryId` NOT NULL 化（新規 FK）                    | 既存 Event 行への「未分類」backfill migration が必要。**breaking migration 検知 → 計画ダウンタイム自動デプロイ**（ユーザー承認済み） |
| `EventCalendarConfig.showPastEvents` 削除                    | 既存ページの Section.config JSON に残る古いキーは無害（`safeParse` が無視）。管理画面の該当トグル UI は削除                          |
| `list` variant の月送り UI 撤去                              | 既存の月ナビ操作 UX が変わる（タブ+検索+カテゴリー+ページングに置換）。calendar variant は無変更                                     |
| `getPublishedEvents()`（引数なし一括取得）の呼び出し元見直し | list variant はこの関数を呼ばなくなる。calendar variant・`getUpcomingEventsExcluding` からの利用は維持                               |
| 新規 admin resource `"eventCategory"`                        | `admin-resources.ts` の Resource union 追加、RBAC 権限設定への反映が必要                                                             |

いずれも「後方互換なし・公式推奨のクリーン実装」の方針に合致する。停止例外に該当する breaking schema 変更はユーザーが 2026-07-23 の対話で明示承認済み。
