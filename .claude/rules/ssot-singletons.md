---
paths:
  - src/**
  - prisma/**
---

# SSOT 定数・シングルトン

プロジェクト全体で単一定義を厳守する定数・シングルトン一覧。ローカル再定義・重複定義は禁止。

## 認証・権限

| 定数/変数                                                                                       | 場所                                 | メモ                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DASHBOARD_ROLES` / `ROLE_LABELS` / `ROLE_DESCRIPTIONS` / `isDashboardRole()` / `DashboardRole` | `@/shared/lib/admin-roles`           | client-safe Role SSoT。`admin-auth.ts`（server-only）が再 export。tuple のため `isDashboardRole()` 型ガード必須                                                                                                                                                                       |
| `INVITABLE_BY` / `getInvitableRoles()` / `canInviteRole()` / `canModifyUser()`                  | `@/shared/lib/admin-roles`           | client-safe RBAC 階層制御。SUPER_ADMIN→ADMIN/EDITOR/VIEWER、ADMIN→EDITOR/VIEWER のみ（特権昇格防止）                                                                                                                                                                                  |
| `adminAuth` / `customerAuth`                                                                    | `@/shared/lib/{admin,customer}-auth` | cookie prefix 分離。顧客は Google/LINE、`basePath: /api/customer-auth`                                                                                                                                                                                                                |
| `Resource` / `Action` / `RESOURCE_LABELS`                                                       | `@/admin/lib/admin-resources`        | client-safe Resource SSoT。`permissions.ts` が再 export                                                                                                                                                                                                                               |
| `TURNSTILE_ACTIONS` / `TurnstileAction` / `DEFAULT_TURNSTILE_APPEARANCE`                        | `@/shared/lib/turnstile-actions`     | client-safe Turnstile action SSoT（英数/`_`/`-`、最大32文字）。server 側 `expectedAction` 検証で同一値参照                                                                                                                                                                            |
| `LogoutButton` / `HeaderAuthSlot`                                                               | `@/public/components/{ui,layouts}/*` | 公開顧客ログアウト SSoT。`HeaderAuthSlot` は `"authenticated" \| "guest"` discriminated union。`signOut({ fetchOptions: { onSuccess: () => router.push + router.refresh } })` で PPR session 無効化。**マイページ等にローカル配置禁止** — ヘッダー右上 1 箇所（→ `auth-patterns.md`） |

## DB / Prisma

| 定数/変数                                                                          | 場所                                          | メモ                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `prisma` / `basePrisma`                                                            | `@/shared/db/prisma`                          | `basePrisma` は Better Auth アダプター専用（`$extends` 前）                                                                                                                                                                          |
| `Prisma` 型 / Prisma enums（`Role` / `ReservationStatus` 等 34 種）                | `@/shared/lib/validations/enums/prisma-types` | client-safe gateway。`Prisma` 名前空間は型のみ再 export。**runtime sentinel（`JsonNull` / `DbNull` / `join` / `sql` / `raw`）は gateway から取得不可** — `shared/db` / `shared/domain` が `@generated/prisma/client` から直接 import |
| `*_STATUS_LABELS` / `AUDIT_ACTION_LABELS` / `PUBLISH_LABELS` / `getPublishLabel()` | `enums/helpers`                               | 全ステータス enum + boolean publish のラベル SSoT。UI でハードコード禁止                                                                                                                                                             |
| `NOTIFICATION_TYPE` / `isValidNotificationType`                                    | `enums/helpers`                               | DB VARCHAR 管理                                                                                                                                                                                                                      |
| `FaqItem.answer`                                                                   | `prisma/schema.prisma`                        | **プレーンテキスト単一列**（`@db.Text`）。管理は `/admin/faq` → `/admin/faq/[categoryId]` master-detail、CRUD は `FaqItemDialog` / `FaqCategoryDialog`。公開は `whitespace-pre-wrap`。Lexical 本文は Post/News/Terms/Section のみ    |

## キャッシュ

| 定数/変数                                                                          | 場所                            | メモ                                                                             |
| ---------------------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------- |
| `CACHE_TAGS` / `getCacheTag` / `CACHE_LIFE`                                        | `@/shared/lib/constants`        | `CACHE_TAGS.SETTINGS` は廃止済 → 個別タグ                                        |
| `invalidateReservationCaches` / `invalidateEventCaches` / `invalidateReviewCaches` | `@/shared/lib/cache/*-cache.ts` | mutation 後のキャッシュ無効化 SSoT。ローカル `updateTag` 羅列禁止、helper を拡張 |

## 外部連携（Calendar / Storage）

| 定数/変数                                                                                            | 場所                                         | メモ                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OUTBOUND_RESERVATION_MARKER` / `OUTBOUND_EVENT_MARKER` / `isAppGeneratedCalendarEvent`              | `@/shared/lib/calendar-sync/loop-prevention` | GCal outbound → inbound ループ防止 SSoT。outbound（`outbound.ts` / `event-outbound.ts`）が description 先頭に「予約ID:」「イベントID:」を埋め込み、inbound（`event-inbound.ts`）が `isAppGeneratedCalendarEvent(description)` で 1 本化判定してスキップ。literal を outbound / inbound で重複定義しない                                                     |
| `buildReservationCalendar` / `buildEventCalendar` / `buildAddToCalendarUrls` / `buildReservationUid` | `@/shared/lib/ical`                          | **RFC 5545 準拠 ICS SSoT**。`ical-generator` v10 + `@touch4it/ical-timezones`。UID 安定・SEQUENCE 管理（`icsSequence` を `{ increment: 1 }`）・METHOD:REQUEST/CANCEL・VTIMEZONE(Asia/Tokyo)。直接 `ical()` 呼び出し禁止。ICS DL は `/api/calendar/*` route（`data:` URL は Gmail ブロック）。UI は `AddToCalendar` Server Component（→ `ical-patterns.md`） |
| `STORAGE_PREFIXES` / `StoragePrefix`                                                                 | `@/shared/lib/r2/keys`                       | 画像ストレージの key prefix SSoT（`spaces` / `posts` / `site` / `media`）。Cloudflare R2 バケット内の仮想フォルダ名に対応。upload / delete の第 2 引数で使用                                                                                                                                                                                                |

## ドメインロジック

| 定数/変数                                                                        | 場所                           | メモ                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `formatEventVenue` / `formatEventAddress`                                        | `@/shared/domain/events/venue` | Event 会場表示 SSoT。`location` + `space` + `addressDetail` の 3 ソース合成。iCal LOCATION / Email / JSON-LD / EventCard / CSV / related events で共通利用。直接組み立て禁止                                                                                                                                                                                           |
| `TERMS_TEMPLATES` / `applyBusinessInfo` / `getTemplatesForType` / `BusinessInfo` | `@/shared/lib/terms-templates` | 規約テンプレート SSoT（8 標準 TermsType の HTML テンプレート + Settings 事業者情報置換ヘルパー）。`【〜を入力してください】` プレースホルダーを Settings から自動置換し、未設定フィールドは入力プロンプトとして UI に残る設計。管理画面 `terms/new/page.tsx` と `seedTerms()` の両方が参照（DRY 化済み）。新規 `TermsType` enum 追加時はこの Record にテンプレ登録必須 |

## Lexical / 記事表示

| 定数/変数                                                              | 場所                                         | メモ                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ArticleLayout` / `ArticleHeader` / `ArticleFooter` / `ArticleTagList` | `@/public/components/{layouts,ui}/article-*` | 公開記事詳細（posts/news/preview）の統一ラッパー SSoT。`<article>` 末尾に個別 border ブロックを重ねない                                                                                                                                                                                                                 |
| `extractHeadings` / `HeadingEntry`                                     | `@/shared/lib/lexical/extract-headings`      | 目次用 h2/h3 抽出（Prisma JSON / 文字列両対応）。永続化済み `anchorId` のみ返す                                                                                                                                                                                                                                         |
| `CustomHeadingNode` / `anchorIdState` / `HeadingAnchorPlugin`          | `@/admin/.../lexical/nodes,plugins`          | `HeadingNode` の NodeState 拡張 + Node Replacement。`HeadingAnchorPlugin` が `generateUniqueSlug` で `anchorId` 自動生成                                                                                                                                                                                                |
| `$getSelectionBlockNodes` / `$isMultiBlockSelection`                   | `@/admin/.../lexical/lib/selection-helpers`  | 選択の「ブロック粒度」を求める SSoT。deepest common ancestor の直接 block-level 子を返す（WordPress Gutenberg の `getCommonRootClientID` 等価）。Group ネストに対応: Root 直下選択 → Root 子、Group 内選択 → Group 子。Floating Text FT（単一）↔ Block FT（複数）の排他制御、`GroupPlugin` から参照。ローカル再実装禁止 |

## 公開 UI / スクロール / アニメ

| 定数/変数                                                 | 場所                                           | メモ                                                                                                                                                                                                                                |
| --------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scrollToElement` / `scrollToElementById` / `scrollToTop` | `@/public/lib/scroll`                          | `--header-height` 補正 + `prefers-reduced-motion` で `behavior: "instant"` 切替                                                                                                                                                     |
| `ScrollReveal` / `ScrollRevealGroup`                      | `@/public/components/animations/scroll-reveal` | 入場演出 SSoT。単一要素は `ScrollReveal`（Hero/CTA）、`.map` リストは `ScrollRevealGroup`（1 ScrollTrigger + stagger）。個別 wrap は fold 外 opacity:0 待機の silent bug（→ `frontend/gsap-patterns.md`）                           |
| `CARD_GRID_COLS_MAP` / `getCardGridColsClass`             | `@/public/lib/section-style-maps`              | 公開 Section（SpaceShowcase / SpaceList / PostList）のカード列数 SSoT。viewport breakpoint ではなく `@container` + `@md:grid-cols-2 @3xl:grid-cols-3` の container query variants で定義。consumer 側で親に `@container` を付与必須 |

## デザイントークン（@theme）

レスポンシブ @theme tokens は `(public)/_styles/public.css` / `(admin)/_styles/admin.css` の `@theme` ブロックが SSoT。
詳細 token 一覧と利用ガイドは `frontend/project-design-config.md` §レスポンシブ設計 を参照。

主要 token 群:

- Breakpoint: `--breakpoint-3xl: 120rem`
- Header: `--header-height`（mobile-md 分岐）
- Hero/Modal/Lightbox/Dropdown: `--hero-min-height` / `--modal-max-height` / `--lightbox-max-{height,width}` / `--dropdown-min-width`
- Prose/Container: `--prose-{narrow,medium}` / `--container-{measure,header-max,max,padding}`
- Touch target: `--touch-target-min`
- Fluid text / spacing: `--text-*` / `--spacing-{section,block,card}`

**新規 arbitrary 値（`[65ch]` / `[85vh]` / `[90svh]` / `[12rem]` 等）を追加する前に既存 token を grep し、不足なら `@theme` に追加してから `min-h-[var(--hero-min-height)]` 等の CSS var 参照形式で利用する。**
