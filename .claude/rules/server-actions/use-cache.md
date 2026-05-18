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
