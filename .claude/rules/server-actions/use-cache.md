---
description: Server Action の 'use cache' パターン + キャッシュ無効化（updateTag / revalidateTag / CACHE_TAGS）
paths:
  - src/**/_actions/**
  - src/**/actions/**
  - src/shared/lib/cache/**
  - src/shared/lib/constants/**
---

# Server Action — 'use cache' / キャッシュ無効化

> Next.js 16 新 API / CACHE_TAGS SSoT

## 'use cache' パターン（Next.js 16 新API）

### 基本キャッシュ（関数レベル）

`'use cache'` ディレクティブで非同期関数の結果をキャッシュ:

```typescript
// NG: キャッシュなし（毎リクエストで DB アクセス）
async function getPosts() {
  return await prisma.post.findMany({ where: { isPublished: true } });
}

// OK: 関数レベルのキャッシュ
async function getPosts() {
  "use cache";
  return await prisma.post.findMany({ where: { isPublished: true } });
}
```

### cacheTag でタグ付け

`cacheTag()` で後から無効化できるようにタグを付与。**CACHE_TAGS 定数必須**（マジックストリング禁止）:

```typescript
import { cacheTag, cacheLife } from "next/cache";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";

// 単一タグ
async function getPosts() {
  "use cache";
  cacheTag(CACHE_TAGS.POSTS);
  return await prisma.post.findMany({ where: { isPublished: true } });
}

// 複数タグ（リスト + 詳細）
async function getPost(slug: string) {
  "use cache";
  cacheTag(CACHE_TAGS.POSTS, getCacheTag.posts.detail(slug));
  return await prisma.post.findUnique({ where: { slug } });
}

// 複数ドメインタグ（Settings は複数タグを付与）
async function getPublicBusinessSettings() {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.BUSINESS_SETTINGS, CACHE_TAGS.SETTINGS);
  // ...
}
```

### CACHE_LIFE 定数（プロジェクト標準）

`@/shared/lib/constants/cache.ts` の `CACHE_LIFE` を使用。cacheLife プリセット文字列を直接書かない:

```typescript
import { CACHE_LIFE } from "@/shared/lib/constants";

// NG: マジックストリング
cacheLife("hours");

// OK: CACHE_LIFE 定数
cacheLife(CACHE_LIFE.PUBLIC_CONTENT); // 'hours'
cacheLife(CACHE_LIFE.STATIC_SETTINGS); // 'days'
cacheLife(CACHE_LIFE.DYNAMIC_DATA); // 'minutes'
cacheLife(CACHE_LIFE.METADATA); // 'hours'
```

| 定数                         | プリセット  | 用途                               |
| ---------------------------- | ----------- | ---------------------------------- |
| `CACHE_LIFE.PUBLIC_CONTENT`  | `'hours'`   | ブログ・ニュース・スペース・ページ |
| `CACHE_LIFE.STATIC_SETTINGS` | `'days'`    | サイト設定・ナビゲーション         |
| `CACHE_LIFE.DYNAMIC_DATA`    | `'minutes'` | 予約状況・在庫                     |
| `CACHE_LIFE.METADATA`        | `'hours'`   | メタデータ・SEO                    |

### cacheLife プリセット一覧（参考）

| プリセット  | stale | revalidate | expire |
| ----------- | ----- | ---------- | ------ |
| `'seconds'` | 30秒  | 1秒        | 60秒   |
| `'minutes'` | 5分   | 1分        | 1時間  |
| `'hours'`   | 5分   | 1時間      | 1日    |
| `'days'`    | 5分   | 1日        | 1週間  |
| `'weeks'`   | 5分   | 1週間      | 1ヶ月  |
| `'max'`     | 5分   | 1ヶ月      | 1年    |

### カスタム有効期限

細かい制御が必要な場合のみ `{ stale, revalidate, expire }` オブジェクトを使用:

```typescript
import { toPlainArray } from "@/shared/lib/serialize";

async function getPopularPosts() {
  "use cache";
  cacheLife({
    stale: 300, // 5分間は stale でも返す
    revalidate: 60, // 60秒後にバックグラウンド再検証
    expire: 3600, // 1時間で完全失効
  });
  cacheTag(CACHE_TAGS.POSTS);
  const result = await prisma.post.findMany({
    take: 10,
    orderBy: { viewCount: "desc" },
  });
  return toPlainArray(result); // React 19: Prisma Symbol プロパティを除去（§禁止事項 item 7）
}
```

---

## キャッシュ無効化パターン

### updateTag（即時失効 — read-your-own-writes）

**Server Actions 内のみ使用可**。同一リクエスト内で変更を即座に反映させる場合に使用:

```typescript
import { updateTag } from "next/cache";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";

export async function createPost(data: CreatePostInput) {
  // ... DB 操作 ...
  const post = await prisma.post.create({ data: validated.data });

  // 即時失効（リスト + 詳細）
  updateTag(CACHE_TAGS.POSTS);
  updateTag(getCacheTag.posts.detail(post.slug));

  return { id: post.id };
}

export async function deletePost(id: string) {
  // ... DB 操作 ...
  await prisma.post.delete({ where: { id } });

  // 関連タグをまとめて即時失効
  updateTag(CACHE_TAGS.POSTS);
  updateTag(CACHE_TAGS.SIDEBAR_DATA);

  return null;
}
```

### revalidateTag（非同期再検証 — stale-while-revalidate）

即時性が不要な場合（バックグラウンド処理・Route Handlers など）。**Next.js 16 公式: 第2引数は CacheLife プリセット文字列または `{ expire }` オブジェクト形式**:

```typescript
import { revalidateTag } from "next/cache";
import { CACHE_TAGS, CACHE_LIFE, getCacheTag } from "@/shared/lib/constants";

// Route Handler（CRON / Webhook）— 実際のプロジェクト例
// src/app/api/cron/calendar-sync/route.ts
// src/app/api/webhooks/google-calendar/route.ts
// ⚠️ Next.js 16: revalidateTag は第2引数（プロファイル）が必須
export async function GET() {
  const result = await syncFromCalendar();
  // ⚠️ updateTag は Server Actions 専用 — Route Handler では revalidateTag を使う
  revalidateTag(CACHE_TAGS.RESERVATIONS, CACHE_LIFE.DYNAMIC_DATA);
  revalidateTag(getCacheTag.reservations.calendar(), CACHE_LIFE.DYNAMIC_DATA);
  return NextResponse.json({ ok: true });
}

// 個別アイテムのみ無効化（第2引数に適切なプロファイルを指定）
revalidateTag(getCacheTag.posts.detail(slug), CACHE_LIFE.PUBLIC_CONTENT);

// 大量バッチ処理・非同期再構築ジョブ — 公式推奨の stale-while-revalidate
// `'max'` プリセット（stale 5分 / revalidate 1ヶ月 / expire 1年）で次回以降の
// リクエストで徐々に再検証させる。cron / webhook 等「次 tick で良い」シナリオ向け
revalidateTag(CACHE_TAGS.POSTS, CACHE_LIFE.MAX);

// 即時失効（オブジェクト形式 — 特殊ケース向け公式API）
// Server Actions では updateTag を優先するため、Route Handler の同期的用途のみ検討
revalidateTag(CACHE_TAGS.POSTS, { expire: 0 });
```

### updateTag vs revalidateTag 比較

| API             | 挙動                               | 使用場所                       | 適用シーン                          |
| --------------- | ---------------------------------- | ------------------------------ | ----------------------------------- |
| `updateTag`     | 即時失効（同一リクエスト内で反映） | **Server Actions 内のみ**      | CRUD 操作後の read-your-own-writes  |
| `revalidateTag` | 非同期再検証（次リクエストで反映） | Server Actions・Route Handlers | バックグラウンド処理・CRON・webhook |

### キャッシュ無効化の優先順位（Next.js 16 公式推奨）

```
updateTag (SA)  >  revalidateTag(tag, CACHE_LIFE.MAX) (SA/RH, SWR)  >  revalidatePath (最終)
```

| 優先順位 | API              | 使用場所            | 選択基準                                                                                   |
| -------- | ---------------- | ------------------- | ------------------------------------------------------------------------------------------ |
| 1        | `updateTag`      | Server Actions      | CRUD 操作後の即時反映（read-your-own-writes）。タグで特定可能な場合の第一選択              |
| 2        | `revalidateTag`  | SA / Route Handlers | cron / webhook / バックグラウンド処理。`CACHE_LIFE.MAX` で stale-while-revalidate          |
| 3        | `revalidatePath` | SA / Route Handlers | タグ管理が現実的でないページ単位 invalidation のみ。原則として 1・2 で対応不可能な場合のみ |

### revalidatePath（最終手段）

タグで対応できない場合のみ。**原則 `updateTag` / `revalidateTag` を優先**:

```typescript
import { revalidatePath } from "next/cache";

// 特定ページ
revalidatePath("/posts");

// レイアウト全体
revalidatePath("/admin", "layout");
```

---

## リソース別 SSoT helper / 定数

### Settings — `CACHE_TAGS.SETTINGS` は廃止済み

粒度タグ（`LAYOUT_SETTINGS`, `BUSINESS_SETTINGS`, `SEO_SETTINGS`, `ORGANIZATION_SETTINGS`, `NOTIFICATION_SETTINGS`, `INTEGRATION_SETTINGS`, `COOKIE_CONSENT`, `ANALYTICS_CONFIG`, `ROBOTS_TXT`, `PERMALINK`, `SOCIAL_LINKS`, `SIDEBAR_SETTINGS`）を直接使用。設定コマンドの `afterSuccess` では影響するドメインのタグのみ無効化する。

### Reservation — `invalidateReservationCaches(id, customerId, options?)` 経由 SSoT

3 点セット（`RESERVATIONS` + `getCacheTag.reservations.detail(id)` + `getCacheTag.reservations.calendar()`）+ `CUSTOMERS` + `getCacheTag.customers.detail(customerId)` + optional coupons/notifications を一括適用。ローカル `updateTag` 羅列禁止。

**顧客統計連動の mutation command は customerId を戻り値に含める必須契約** — `select` に `customerId: true` を追加し `return { ..., customerId: reservation.customerId }` で返す（参照実装: `createCheckoutSessionCommand` / `refundReservationPaymentCommand`）。

例外: notes 単独変更は顧客統計に影響しないため 3 点セットのみ適用（helper 不使用で可、`updateReservationNotes` が実例）。

### Customer — 統計連動操作で `customers.detail(customerId)` 必須

予約作成・キャンセル・変更時に `updateTag(CACHE_TAGS.CUSTOMERS)` だけでなく `updateTag(getCacheTag.customers.detail(customerId))` も追加。マイページ・公開フォームの両方で必要（管理画面の顧客詳細キャッシュ用）。

### Location — slug タグ + ベースタグ両方を無効化

`updateLocation` / `createLocation` の `afterSuccess` で `updateTag(CACHE_TAGS.LOCATIONS)` + `updateTag(getCacheTag.locations.detail(data.slug))` 必須。MEO フィールド更新時も同じタグで無効化（粒度を分けない）。LocalBusiness JSON-LD は `CACHE_TAGS.LOCATIONS` でタグ付けされているため、slug タグ + ベースタグの両方を無効化しないと `/access` 一覧ページのキャッシュが残る silent bug になる。

### Event — `invalidateEventCaches` に slug 引数を省略しない

`publishEvent` / `cancelEvent` 等で slug を渡さないと `getCacheTag.events.slug(slug)` が無効化されず公開ページに古いデータが残る。`execute` 内で `getEventById` から slug を取得して渡す。
