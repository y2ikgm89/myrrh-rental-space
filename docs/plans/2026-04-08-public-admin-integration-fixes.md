# 公開-管理連携 問題修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 公開ページと管理画面の連携における キャッシュ無効化漏れ・Turnstile 欠落・Cron タイムゾーン・並行ロック・未使用タグ を一括修正する

**Architecture:** 各修正は独立しており並行実行可能。キャッシュ無効化は gotchas.md の「予約3点セット」「顧客統計は detail も必須」パターンに準拠。Cron 修正は既存の authorizeCronRequest + unstable_rethrow パターンを維持。

**Tech Stack:** Next.js 16 (`updateTag`/`revalidateTag`), Zod 4, PostgreSQL advisory lock, Intl.DateTimeFormat (JST)

---

### Task 1: `submitReview` — Turnstile 追加 + CUSTOMERS キャッシュ無効化

**Files:**

- Modify: `src/shared/lib/validations/review.ts`
- Modify: `src/app/(public)/_shared/actions/review.ts`

- [ ] **Step 1: Zod スキーマに turnstileToken フィールド追加**

```typescript
// src/shared/lib/validations/review.ts
// 既存の spaceReviewSchema に turnstileToken を追加
export const spaceReviewSchema = z.object({
  reservationId: z.string().uuid({ error: "予約IDが不正です" }),
  rating: z
    .number()
    .int()
    .min(1, { error: "1以上を選択してください" })
    .max(5, { error: "5以下を選択してください" }),
  title: z
    .string()
    .max(100, { error: "タイトルは100文字以内" })
    .optional()
    .or(z.literal("")),
  comment: z
    .string()
    .max(1000, { error: "コメントは1000文字以内" })
    .optional()
    .or(z.literal("")),
  turnstileToken: z.string().min(1, { error: "認証トークンが必要です" }),
});
```

- [ ] **Step 2: Server Action に Turnstile 検証 + CUSTOMERS 無効化追加**

```typescript
// src/app/(public)/_shared/actions/review.ts
// import に validateTurnstile を追加
import {
  checkActionRateLimit,
  createValidationMutationError,
  validateTurnstile,
} from "@/shared/lib/action-helpers";

// submitReview 関数内、parsed.success チェック後に以下を追加:

// 2.5. Turnstile verification
const turnstile = await validateTurnstile(parsed.data.turnstileToken);
if (!turnstile.success) {
  return createMutationError(turnstile.error);
}

// キャッシュ無効化セクション（行 50-53）を以下に変更:
updateTag(CACHE_TAGS.REVIEWS);
updateTag(getCacheTag.reviews.space(result.spaceId));
updateTag(getCacheTag.reviews.stats(result.spaceId));
updateTag(CACHE_TAGS.CUSTOMERS);
updateTag(getCacheTag.customers.detail(customer.id));
```

- [ ] **Step 3: レビューフォームコンポーネントに TurnstileWidget 追加**

レビューフォームを使用しているクライアントコンポーネントを検索し、`TurnstileWidget` を追加。`turnstileToken` を送信データに含める。

```bash
# レビューフォームの使用箇所を検索
```

- [ ] **Step 4: type-check 実行**

```bash
bun run type-check
```

- [ ] **Step 5: コミット**

```bash
git add src/shared/lib/validations/review.ts src/app/'(public)'/_shared/actions/review.ts
# レビューフォームコンポーネントも add
git commit -m "fix(review): add Turnstile verification and CUSTOMERS cache invalidation"
```

---

### Task 2: `updateProfileAction` — detail タグ無効化追加

**Files:**

- Modify: `src/app/(public)/mypage/_shared/actions/profile.ts`

- [ ] **Step 1: getCustomerByUserId import 追加 + detail タグ無効化**

```typescript
// src/app/(public)/mypage/_shared/actions/profile.ts
// import に getCacheTag を追加
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";

// updateProfileAction 内、updateCustomerProfileByUserId 呼び出し後:
await updateCustomerProfileByUserId(session.user.id, {
  lastName: parsed.data.lastName,
  firstName: parsed.data.firstName,
  phoneNumber: parsed.data.phoneNumber || null,
});

// customerId を取得して detail タグも無効化
const customer = await getCustomerByUserId(session.user.id);
updateTag(CACHE_TAGS.CUSTOMERS);
if (customer) {
  updateTag(getCacheTag.customers.detail(customer.id));
}
```

- [ ] **Step 2: type-check 実行**

```bash
bun run type-check
```

- [ ] **Step 3: コミット**

```bash
git add src/app/'(public)'/mypage/_shared/actions/profile.ts
git commit -m "fix(profile): add customers.detail cache tag invalidation"
```

---

### Task 3: `deleteAccountAction` — キャッシュ無効化追加

**Files:**

- Modify: `src/app/(public)/mypage/_shared/actions/account.ts`

- [ ] **Step 1: キャッシュ無効化を追加**

```typescript
// src/app/(public)/mypage/_shared/actions/account.ts
// import 追加
import { updateTag } from "next/cache";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";

// deleteAccountAction 内、auth.api.deleteUser() の前に customerId を取得:
export async function deleteAccountAction(): Promise<MutationResult<null>> {
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return createMutationError("リクエストが多すぎます");

  const session = await getSession();
  if (!session) return createMutationError("認証が必要です");

  // 削除前に customerId を取得（削除後は取得不可）
  const customer = await getCustomerByUserId(session.user.id);

  try {
    await auth.api.deleteUser({
      headers: await headers(),
      body: {},
    });

    // キャッシュ無効化（User 削除により Cascade で Customer/Reservation 等も削除される）
    updateTag(CACHE_TAGS.CUSTOMERS);
    updateTag(CACHE_TAGS.RESERVATIONS);
    updateTag(CACHE_TAGS.REVIEWS);
    updateTag(CACHE_TAGS.INQUIRIES);
    updateTag(CACHE_TAGS.EVENTS);
    if (customer) {
      updateTag(getCacheTag.customers.detail(customer.id));
    }

    return null;
  } catch (error) {
    // ... 既存の error handling
  }
}
```

- [ ] **Step 2: type-check 実行**

```bash
bun run type-check
```

- [ ] **Step 3: コミット**

```bash
git add src/app/'(public)'/mypage/_shared/actions/account.ts
git commit -m "fix(account): add cache invalidation on account deletion"
```

---

### Task 4: `cancelEventRegistration` — CUSTOMERS 条件付き無効化

**Files:**

- Modify: `src/app/(public)/_shared/actions/event-registration.ts`

- [ ] **Step 1: キャッシュ無効化に CUSTOMERS を追加**

```typescript
// src/app/(public)/_shared/actions/event-registration.ts
// cancelEventRegistration 内、行 161-164 のキャッシュ無効化を以下に変更:

// 5. Invalidate cache
updateTag(CACHE_TAGS.EVENTS);
updateTag(getCacheTag.events.detail(registration.eventId));
updateTag(getCacheTag.eventRegistrations.list(registration.eventId));

// 顧客統計が変わる場合は CUSTOMERS も無効化
if (customer) {
  updateTag(CACHE_TAGS.CUSTOMERS);
  updateTag(getCacheTag.customers.detail(customer.id));
}
```

注意: `customer` 変数は行 151 で既に取得済み。

- [ ] **Step 2: type-check 実行**

```bash
bun run type-check
```

- [ ] **Step 3: コミット**

```bash
git add src/app/'(public)'/_shared/actions/event-registration.ts
git commit -m "fix(event-registration): add CUSTOMERS cache invalidation on cancellation"
```

---

### Task 5: 予約リマインダー Cron — JST タイムゾーン修正

**Files:**

- Modify: `src/app/api/cron/reservation-reminder/route.ts`

- [ ] **Step 1: UTC → JST の日付計算を修正**

```typescript
// src/app/api/cron/reservation-reminder/route.ts
// 行 25-32 の日付計算を以下に置換:

// JST で翌日の日付を計算（Cloud Run は UTC 環境）
const jstFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const now = new Date();
const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
const tomorrowJstStr = jstFormatter.format(tomorrow); // "YYYY-MM-DD"

// JST の翌日 00:00:00 〜 23:59:59 を UTC に変換
const startOfWindow = new Date(`${tomorrowJstStr}T00:00:00+09:00`);
const endOfWindow = new Date(`${tomorrowJstStr}T23:59:59.999+09:00`);
```

- [ ] **Step 2: type-check 実行**

```bash
bun run type-check
```

- [ ] **Step 3: コミット**

```bash
git add src/app/api/cron/reservation-reminder/route.ts
git commit -m "fix(cron): use JST timezone for reservation reminder window calculation"
```

---

### Task 6: カレンダー同期 Cron — PostgreSQL advisory lock 追加

**Files:**

- Modify: `src/app/api/cron/calendar-sync/route.ts`

- [ ] **Step 1: advisory lock を追加**

```typescript
// src/app/api/cron/calendar-sync/route.ts
// import 追加
import { prisma } from "@/shared/db/prisma";

// GET handler 内、isTwoWaySyncEnabled チェック後（行 66 付近）に以下を追加:

// 並行実行ロック（Cloud Run 複数インスタンス対策）
// advisory lock ID は固定値（calendar-sync 用）
const CALENDAR_SYNC_LOCK_ID = 728349;
const lockResult = await prisma.$queryRaw<
  { pg_try_advisory_lock: boolean }[]
>`SELECT pg_try_advisory_lock(${CALENDAR_SYNC_LOCK_ID})`;
const acquired = lockResult[0]?.pg_try_advisory_lock === true;
if (!acquired) {
  return jsonSuccess({
    skipped: true,
    reason: "Another sync is already running",
  });
}

try {
  // === 既存の Webhook 更新 + 同期処理（行 76-161）をここに移動 ===
} finally {
  // ロック解放
  await prisma.$queryRaw`SELECT pg_advisory_unlock(${CALENDAR_SYNC_LOCK_ID})`;
}
```

- [ ] **Step 2: type-check 実行**

```bash
bun run type-check
```

- [ ] **Step 3: コミット**

```bash
git add src/app/api/cron/calendar-sync/route.ts
git commit -m "fix(cron): add PostgreSQL advisory lock to prevent concurrent calendar sync"
```

---

### Task 7: SectionType enum に `event-calendar` 追加

**Files:**

- Modify: `src/shared/lib/validations/section.ts`
- Modify: `src/app/(public)/_shared/components/sections/SectionRenderer.tsx`

- [ ] **Step 1: SectionType に EVENT_CALENDAR を追加**

```typescript
// src/shared/lib/validations/section.ts
// SectionType 定数（行 63-81 付近）に追加:
export const SectionType = {
  HERO: "hero",
  HERO_PARALLAX: "hero-parallax",
  CUSTOM: "custom",
  CONCEPT: "concept",
  SPACE_LIST: "space-list",
  SPACE_SHOWCASE: "space-showcase",
  NEWS_LIST: "news-list",
  POST_LIST: "post-list",
  FAQ_LIST: "faq-list",
  FEATURES: "features",
  TESTIMONIAL: "testimonial",
  GALLERY: "gallery",
  CTA: "cta",
  CONTACT_FORM: "contact-form",
  MAP: "map",
  EMBED: "embed",
  INSTAGRAM: "instagram",
  EVENT_CALENDAR: "event-calendar", // 追加
} as const;
```

- [ ] **Step 2: sectionConfigSchemas に event-calendar を追加**

registry.ts から `eventCalendarConfigSchema` を確認し、section.ts の `sectionConfigSchemas` マップに追加。

- [ ] **Step 3: SectionRenderer に event-calendar case 追加**

```typescript
// src/app/(public)/_shared/components/sections/SectionRenderer.tsx
// 既存の case の後、default の前に追加:

    case SectionType.EVENT_CALENDAR: {
      // event-calendar セクションは events/page.tsx で直接レンダリング済み
      // SectionRenderer 経由で使用される場合のフォールバック
      return null;
    }
```

注意: `event-calendar` は `/events` ページで FullCalendar として直接実装されている。SectionRenderer では null を返すが、SectionType enum に含めることで型の一貫性を確保する。

- [ ] **Step 4: type-check 実行**

```bash
bun run type-check
```

- [ ] **Step 5: コミット**

```bash
git add src/shared/lib/validations/section.ts src/app/'(public)'/_shared/components/sections/SectionRenderer.tsx
git commit -m "fix(sections): add event-calendar to SectionType enum"
```

---

### Task 8: 未使用 CACHE_TAGS 削除

**Files:**

- Modify: `src/shared/lib/constants/cache.ts`

- [ ] **Step 1: 未使用タグの使用箇所がないことを確認**

```bash
# 各タグの使用箇所を確認（cache.ts の定義行以外）
grep -r "CANCELLATION_POLICY" src/ --include="*.ts" --include="*.tsx" | grep -v "cache.ts"
grep -r "FAQ_CATEGORIES" src/ --include="*.ts" --include="*.tsx" | grep -v "cache.ts"
grep -r "LAYOUT\"" src/ --include="*.ts" --include="*.tsx" | grep -v "cache.ts" | grep -v "LAYOUT_SETTINGS"
grep -r "PERMISSIONS" src/ --include="*.ts" --include="*.tsx" | grep -v "cache.ts" | grep -v "permissions"
```

- [ ] **Step 2: 使用されていないタグを削除**

```typescript
// src/shared/lib/constants/cache.ts
// 以下のエントリを削除（使用箇所がないことを確認後）:
// - CANCELLATION_POLICY (行 148)
// - FAQ_CATEGORIES (行 94)
// - LAYOUT (行 128)
// - PERMISSIONS (行 152)
```

注意: `HOMEPAGE_SECTIONS` と `EVENT_REGISTRATIONS` は cacheTag / getCacheTag で使用されている可能性があるため、grep で確認してから判断する。

- [ ] **Step 3: type-check 実行**

```bash
bun run type-check
```

- [ ] **Step 4: コミット**

```bash
git add src/shared/lib/constants/cache.ts
git commit -m "chore(cache): remove unused CACHE_TAGS entries"
```

---

### Task 9: Cron リマインダー — キャンセル済み予約のメール送信防止

**Files:**

- Modify: `src/app/api/cron/reservation-reminder/route.ts`

- [ ] **Step 1: メール送信前にステータス再チェック**

```typescript
// src/app/api/cron/reservation-reminder/route.ts
// import 追加
import { ACTIVE_RESERVATION_STATUSES } from "@/shared/lib/validations/enums";

// for ループ内（行 42-73）、sendReservationReminderEmail の前に:

    for (const reservation of reservations) {
      const email = reservation.customer?.email;
      if (!email) {
        skipped++;
        continue;
      }

      // Cron 実行中にキャンセルされた予約をスキップ
      if (!ACTIVE_RESERVATION_STATUSES.includes(reservation.status)) {
        skipped++;
        continue;
      }

      try {
        await sendReservationReminderEmail({
          // ... 既存コード
        });
```

注意: `findReservationsForReminderWindow` が既に ACTIVE_RESERVATION_STATUSES でフィルタしている場合、この二重チェックは Cron 実行中のステータス変更に対する防御層。

- [ ] **Step 2: type-check 実行**

```bash
bun run type-check
```

- [ ] **Step 3: コミット**

```bash
git add src/app/api/cron/reservation-reminder/route.ts
git commit -m "fix(cron): skip cancelled reservations during reminder email loop"
```

---

### Task 10: 最終検証

- [ ] **Step 1: validate 実行**

```bash
bun run validate
```

- [ ] **Step 2: build 実行**

```bash
bun run build
```

- [ ] **Step 3: 全修正の grep 確認**

```bash
# submitReview に validateTurnstile があること
grep -n "validateTurnstile" src/app/'(public)'/_shared/actions/review.ts

# updateProfileAction に customers.detail があること
grep -n "customers.detail" src/app/'(public)'/mypage/_shared/actions/profile.ts

# deleteAccountAction に updateTag があること
grep -n "updateTag" src/app/'(public)'/mypage/_shared/actions/account.ts

# cancelEventRegistration に CUSTOMERS があること
grep -n "CUSTOMERS" src/app/'(public)'/_shared/actions/event-registration.ts

# リマインダーに Asia/Tokyo があること
grep -n "Asia/Tokyo" src/app/api/cron/reservation-reminder/route.ts

# calendar-sync に advisory_lock があること
grep -n "advisory_lock\|pg_try_advisory_lock" src/app/api/cron/calendar-sync/route.ts

# SectionType に EVENT_CALENDAR があること
grep -n "EVENT_CALENDAR\|event-calendar" src/shared/lib/validations/section.ts
```
