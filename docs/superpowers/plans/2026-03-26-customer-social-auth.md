# 顧客ソーシャルログイン + マイページ 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Google / LINE ソーシャルログインと顧客マイページ（予約閲覧・変更・キャンセル）を実装する

**Architecture:** Better Auth 単一インスタンスに CUSTOMER ロールを追加し、Customer ↔ User を userId FK で遅延紐づけ。マイページは `/mypage` 配下に Server Component ベースで構築。予約変更・キャンセルは時間ベースの期限設定付き。

**Tech Stack:** Next.js 16, Better Auth 1.5.6 (Google + LINE OAuth), Prisma 7.5, React 19, Zod 4, Bun Test

**Spec:** `docs/superpowers/specs/2026-03-26-customer-social-auth-design.md`

---

## ファイル構成

### 新規作成

| ファイル                                                                               | 責務                                                |
| -------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `src/shared/domain/customers/link.ts`                                                  | `ensureCustomerLinked` — User ↔ Customer 遅延紐づけ |
| `src/shared/domain/reservations/customer-commands.ts`                                  | 顧客用の予約変更・キャンセルコマンド                |
| `src/shared/domain/reservations/customer-queries.ts`                                   | 顧客用の予約一覧・詳細クエリ                        |
| `src/shared/domain/reservations/deadline.ts`                                           | 変更・キャンセル期限チェック                        |
| `src/shared/lib/validations/customer-reservation.ts`                                   | 顧客用予約変更の Zod スキーマ                       |
| `src/app/(public)/login/page.tsx`                                                      | ソーシャルログインページ                            |
| `src/app/(public)/login/_components/social-login-buttons.tsx`                          | Google/LINE ログインボタン                          |
| `src/app/(public)/mypage/layout.tsx`                                                   | マイページレイアウト（認証 + 紐づけ）               |
| `src/app/(public)/mypage/page.tsx`                                                     | 予約一覧ダッシュボード                              |
| `src/app/(public)/mypage/_components/reservation-list.tsx`                             | 予約一覧コンポーネント                              |
| `src/app/(public)/mypage/_components/reservation-card.tsx`                             | 予約カード                                          |
| `src/app/(public)/mypage/_components/mypage-nav.tsx`                                   | マイページナビゲーション                            |
| `src/app/(public)/mypage/_shared/actions/reservation.ts`                               | マイページ用 Server Actions                         |
| `src/app/(public)/mypage/_shared/actions/profile.ts`                                   | プロフィール更新 Server Action                      |
| `src/app/(public)/mypage/_shared/actions/account.ts`                                   | アカウント連携 Server Actions                       |
| `src/app/(public)/mypage/reservations/[id]/page.tsx`                                   | 予約詳細                                            |
| `src/app/(public)/mypage/reservations/[id]/_components/reservation-detail.tsx`         | 予約詳細コンポーネント                              |
| `src/app/(public)/mypage/reservations/[id]/_components/cancel-button.tsx`              | キャンセルボタン                                    |
| `src/app/(public)/mypage/reservations/[id]/edit/page.tsx`                              | 予約変更ページ                                      |
| `src/app/(public)/mypage/reservations/[id]/edit/_components/edit-reservation-form.tsx` | 予約変更フォーム                                    |
| `src/app/(public)/mypage/settings/page.tsx`                                            | アカウント設定                                      |
| `src/app/(public)/mypage/settings/_components/profile-form.tsx`                        | プロフィール編集                                    |
| `src/app/(public)/mypage/settings/_components/account-linking.tsx`                     | Google/LINE 連携管理                                |
| `src/shared/domain/settings/public-queries.ts`                                         | 公開ページ用 Settings クエリ（deadline 等）         |
| `__tests__/unit/shared/domain/customers/link.test.ts`                                  | ensureCustomerLinked テスト                         |
| `__tests__/unit/shared/domain/reservations/deadline.test.ts`                           | 期限チェックテスト                                  |
| `__tests__/unit/shared/domain/reservations/customer-commands.test.ts`                  | 顧客用キャンセル・変更コマンドテスト                |
| `__tests__/unit/shared/lib/validations/customer-reservation.test.ts`                   | 変更スキーマテスト                                  |

### 修正

| ファイル                                                                                 | 変更内容                                                                            |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                                                                   | Role enum に CUSTOMER 追加、Customer に userId FK、Settings に deadline フィールド  |
| `src/shared/lib/auth.ts`                                                                 | LINE プロバイダー追加、accountLinking、verifyCustomerSession、Calendar スコープ削除 |
| `src/shared/lib/auth-client.ts`                                                          | linkSocial / unlinkAccount エクスポート追加                                         |
| `src/shared/lib/env/server.ts`                                                           | LINE_CLIENT_ID, LINE_CLIENT_SECRET 追加                                             |
| `src/shared/domain/customers/types.ts`                                                   | userId フィールド追加、CustomerWithAccount 型追加                                   |
| `src/shared/domain/customers/queries.ts`                                                 | userId 関連クエリ追加                                                               |
| `src/shared/domain/settings/types.ts`                                                    | cancellationDeadlineHours, modificationDeadlineHours 追加                           |
| `src/shared/domain/settings/commands.ts`                                                 | deadline 更新コマンド追加                                                           |
| `src/shared/domain/settings/admin-queries.ts`                                            | deadline フィールドの select 追加                                                   |
| `src/shared/domain/reservations/commands.ts`                                             | resolveOrCreateCustomer に userId 引数追加、Reservation.userId セット               |
| `src/app/(public)/_shared/components/layouts/site-header.tsx` (or equivalent)            | ログイン/マイページリンク追加                                                       |
| `src/app/(public)/reservation/_components/customer-step.tsx`                             | ログイン済みプリフィル対応                                                          |
| `src/app/(public)/reservation/_components/reservation-form.tsx`                          | セッション取得 + プリフィルデータ受け渡し                                           |
| `src/app/(public)/_shared/actions/reservation.ts`                                        | userId を予約コマンドに渡す                                                         |
| `src/app/(admin)/admin/(dashboard)/customers/[id]/_components/CustomerDetail.tsx`        | アカウント連携状況表示                                                              |
| `src/app/(admin)/admin/(dashboard)/settings/_components/sections/ReservationSection.tsx` | 期限設定フィールド追加                                                              |
| `prisma/seed.ts`                                                                         | Settings に deadline デフォルト値追加                                               |

---

## Task 1: DB スキーマ変更

**Files:**

- Modify: `prisma/schema.prisma`
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Role enum に CUSTOMER を追加**

`prisma/schema.prisma` の Role enum に CUSTOMER を追加:

```prisma
enum Role {
  SUPER_ADMIN
  ADMIN
  EDITOR
  VIEWER
  USER
  CUSTOMER
}
```

- [ ] **Step 2: Customer モデルに userId FK を追加**

```prisma
model Customer {
  // ... 既存フィールドの末尾に追加 ...
  userId  String? @unique @db.Uuid
  user    User?   @relation("CustomerUser", fields: [userId], references: [id], onDelete: SetNull)

  // 既存の @@index に加えて
  @@index([userId])
}
```

User モデルにリレーション追加:

```prisma
model User {
  // ... 既存リレーションに追加 ...
  customer  Customer? @relation("CustomerUser")
}
```

- [ ] **Step 3: Settings モデルに deadline フィールドを追加**

```prisma
model Settings {
  // ... 既存フィールドの末尾に追加 ...
  cancellationDeadlineHours  Int @default(24)
  modificationDeadlineHours  Int @default(24)
}
```

- [ ] **Step 4: seed.ts に deadline デフォルト値を追加**

Settings の seed データに `cancellationDeadlineHours: 24, modificationDeadlineHours: 24` を追加。

- [ ] **Step 5: マイグレーション生成**

Run: `bunx --bun prisma migrate dev --name add-customer-social-auth`

- [ ] **Step 6: type-check 実行**

Run: `bun run type-check`
Expected: PASS（新フィールドは optional なので既存コードに影響なし）

- [ ] **Step 7: コミット**

```bash
git add prisma/
git commit -m "feat(db): add CUSTOMER role, Customer.userId FK, deadline settings"
```

---

## Task 2: 環境変数 + Better Auth 設定

**Files:**

- Modify: `src/shared/lib/env/server.ts`
- Modify: `src/shared/lib/auth.ts`
- Modify: `src/shared/lib/auth-client.ts`

- [ ] **Step 1: 環境変数に LINE 認証情報を追加**

`src/shared/lib/env/server.ts` に追加:

```typescript
LINE_CLIENT_ID: z.string().optional(),
LINE_CLIENT_SECRET: z.string().optional(),
```

`runtimeEnv` にも追加:

```typescript
LINE_CLIENT_ID: process.env.LINE_CLIENT_ID,
LINE_CLIENT_SECRET: process.env.LINE_CLIENT_SECRET,
```

- [ ] **Step 2: Better Auth に LINE プロバイダーと accountLinking を追加**

`src/shared/lib/auth.ts` の `createAuth()` を修正:

1. Google の calendar.events スコープを削除（`["openid", "email", "profile"]` のみ）
2. LINE プロバイダーを条件付きで追加:

```typescript
const lineClientId = serverEnv.LINE_CLIENT_ID;
const lineClientSecret = serverEnv.LINE_CLIENT_SECRET;

const socialProviders = {
  ...(googleClientId && googleClientSecret
    ? {
        google: {
          clientId: googleClientId,
          clientSecret: googleClientSecret,
          scope: ["openid", "email", "profile"],
        },
      }
    : {}),
  ...(lineClientId && lineClientSecret
    ? {
        line: {
          clientId: lineClientId,
          clientSecret: lineClientSecret,
          scope: ["openid", "profile", "email"],
        },
      }
    : {}),
};
```

3. accountLinking を追加:

```typescript
account: {
  accountLinking: {
    enabled: true,
    trustedProviders: ["google", "line"],
  },
},
```

4. role のデフォルトを CUSTOMER に変更:

```typescript
user: {
  additionalFields: {
    role: {
      type: "string",
      defaultValue: "CUSTOMER",
      input: false,
    },
  },
},
```

- [ ] **Step 3: verifyCustomerSession ヘルパーを追加**

`src/shared/lib/auth.ts` に追加:

```typescript
const ADMIN_ROLES: Role[] = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.EDITOR,
  Role.VIEWER,
];

export async function verifyCustomerSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  const user = getSessionUser(session);
  if (ADMIN_ROLES.includes(user.role)) redirect("/admin");
  return { session, user };
}
```

- [ ] **Step 4: auth-client.ts にソーシャルログイン関連エクスポート追加**

`src/shared/lib/auth-client.ts` に追加:

```typescript
export const { signIn, signOut, signUp, useSession, getSession, linkSocial } =
  authClient;
```

`linkSocial` は Better Auth クライアントの組み込みメソッド。

- [ ] **Step 5: type-check 実行**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/shared/lib/
git commit -m "feat(auth): add LINE provider, accountLinking, verifyCustomerSession"
```

---

## Task 3: Settings ドメイン更新

**Files:**

- Modify: `src/shared/domain/settings/types.ts`
- Modify: `src/shared/domain/settings/commands.ts`
- Modify: `src/shared/domain/settings/admin-queries.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/index.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/settings/_components/sections/ReservationSection.tsx`

@add-settings-field スキルのパターンに従い、4箇所（types → queries → commands → UI）を更新。

- [ ] **Step 1: types.ts に deadline フィールドを追加**

`src/shared/domain/settings/types.ts` の `SettingsData` 型に追加:

```typescript
cancellationDeadlineHours: number;
modificationDeadlineHours: number;
```

- [ ] **Step 2: admin-queries.ts の select に追加**

Settings を取得する select 句に `cancellationDeadlineHours: true, modificationDeadlineHours: true` を追加。

- [ ] **Step 3: commands.ts に更新関数を追加（または既存の reservation settings 更新に含める）**

既存の予約設定更新コマンドに deadline フィールドを追加。

- [ ] **Step 4: ReservationSection.tsx に期限設定 UI を追加**

select フィールドで 1, 3, 6, 12, 24, 48, 72 時間を選択可能にする:

```typescript
const DEADLINE_OPTIONS = [
  { value: 1, label: "1時間前" },
  { value: 3, label: "3時間前" },
  { value: 6, label: "6時間前" },
  { value: 12, label: "12時間前" },
  { value: 24, label: "24時間前" },
  { value: 48, label: "48時間前" },
  { value: 72, label: "72時間前" },
];
```

- [ ] **Step 5: type-check + validate 実行**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/shared/domain/settings/ src/app/'(admin)'/
git commit -m "feat(settings): add cancellation/modification deadline hours"
```

---

## Task 4: 期限チェックユーティリティ

**Files:**

- Create: `src/shared/domain/reservations/deadline.ts`
- Create: `__tests__/unit/shared/domain/reservations/deadline.test.ts`

- [ ] **Step 1: 期限チェックのテストを書く**

```typescript
// CustomerRecord に追加
userId: string | null;

// 新規型
type CustomerAccountInfo = {
  provider: string; // "google" | "line" | "credential"
};

type CustomerWithAccount = CustomerRecord & {
  user: {
    accounts: CustomerAccountInfo[];
  } | null;
};
```

- [ ] **Step 2: queries.ts に userId 関連の select と getCustomerByUserId を追加**

既存の select 句に `userId: true` を追加。新規クエリ:

```typescript
export async function getCustomerByUserId(userId: string) {
  return prisma.customer.findUnique({
    where: { userId },
    select: {
      /* 標準 select */
    },
  });
}
```

- [ ] **Step 3: 期限チェックユーティリティのテストを書く**

Create `__tests__/unit/shared/domain/reservations/deadline.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { isWithinDeadline } from "@/shared/domain/reservations/deadline";

describe("isWithinDeadline", () => {
  test("予約開始の24時間以上前なら true", () => {
    const startTime = new Date("2026-04-01T10:00:00Z");
    const now = new Date("2026-03-30T10:00:00Z"); // 48時間前
    expect(isWithinDeadline(startTime, 24, now)).toBe(true);
  });

  test("予約開始の24時間以内なら false", () => {
    const startTime = new Date("2026-04-01T10:00:00Z");
    const now = new Date("2026-03-31T20:00:00Z"); // 14時間前
    expect(isWithinDeadline(startTime, 24, now)).toBe(false);
  });

  test("ちょうど24時間前なら true（境界値）", () => {
    const startTime = new Date("2026-04-01T10:00:00Z");
    const now = new Date("2026-03-31T10:00:00Z"); // ちょうど24時間前
    expect(isWithinDeadline(startTime, 24, now)).toBe(true);
  });

  test("deadlineHours=1 で1時間以内なら false", () => {
    const startTime = new Date("2026-04-01T10:00:00Z");
    const now = new Date("2026-04-01T09:30:00Z"); // 30分前
    expect(isWithinDeadline(startTime, 1, now)).toBe(false);
  });
});
```

- [ ] **Step 4: テストが失敗することを確認**

Run: `bun test __tests__/unit/shared/domain/reservations/deadline.test.ts`
Expected: FAIL

- [ ] **Step 5: deadline.ts を実装**

Create `src/shared/domain/reservations/deadline.ts`:

```typescript
export function isWithinDeadline(
  startTime: Date,
  deadlineHours: number,
  now: Date = new Date(),
): boolean {
  const deadlineMs = deadlineHours * 60 * 60 * 1000;
  const timeUntilStart = startTime.getTime() - now.getTime();
  return timeUntilStart >= deadlineMs;
}
```

- [ ] **Step 6: テストが通ることを確認**

Run: `bun test __tests__/unit/shared/domain/reservations/deadline.test.ts`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add src/shared/domain/reservations/deadline.ts __tests__/unit/shared/domain/reservations/deadline.test.ts
git commit -m "feat(domain): add reservation deadline check utility"
```

---

## Task 5: Customer ドメイン更新 + ensureCustomerLinked

**Files:**

- Modify: `src/shared/domain/customers/types.ts`
- Modify: `src/shared/domain/customers/queries.ts`
- Create: `src/shared/domain/customers/link.ts`
- Create: `src/shared/domain/settings/public-queries.ts`
- Create: `__tests__/unit/shared/domain/customers/link.test.ts`

- [ ] **Step 1: types.ts に userId と Account 関連型を追加**

```typescript
// CustomerRecord に追加
userId: string | null;

// 新規型
type CustomerAccountInfo = {
  provider: string; // "google" | "line" | "credential"
};

type CustomerWithAccount = CustomerRecord & {
  user: {
    accounts: CustomerAccountInfo[];
  } | null;
};
```

- [ ] **Step 2: queries.ts に userId 関連の select と getCustomerByUserId を追加**

既存の select 句に `userId: true` を追加。新規クエリ:

```typescript
export async function getCustomerByUserId(userId: string) {
  return prisma.customer.findUnique({
    where: { userId },
    select: {
      /* 標準 select */
    },
  });
}
```

- [ ] **Step 3: 公開ページ用 Settings クエリを作成**

Create `src/shared/domain/settings/public-queries.ts`:

admin-queries.ts を公開ページからは import しない。公開ページが必要とするフィールドのみ取得する軽量クエリを新設:

```typescript
import { prisma } from "@/shared/db/prisma";

export async function getReservationDeadlineSettings() {
  const settings = await prisma.settings.findFirstOrThrow({
    select: {
      cancellationDeadlineHours: true,
      modificationDeadlineHours: true,
    },
  });
  return settings;
}
```

- [ ] **Step 4: ensureCustomerLinked のテストを書く**

Create `__tests__/unit/shared/domain/customers/link.test.ts` — Prisma をモックして:

1. userId で既存 Customer が見つかる場合 → そのまま return
2. email で既存 Customer が見つかる場合 → userId をセットして return
3. どちらも見つからない場合 → 新規 Customer を作成
4. 競合状態（unique constraint error）→ フォールバックで取得

- [ ] **Step 5: テスト実行（失敗確認）**

Run: `bun test __tests__/unit/shared/domain/customers/link.test.ts`
Expected: FAIL

- [ ] **Step 6: ensureCustomerLinked を実装**

Create `src/shared/domain/customers/link.ts`:

```typescript
import { prisma } from "@/shared/db/prisma";
import { Prisma } from "@prisma/client";

const CUSTOMER_LINK_SELECT = {
  id: true,
  email: true,
  lastName: true,
  firstName: true,
  userId: true,
} as const;

export async function ensureCustomerLinked(user: {
  id: string;
  email: string;
  name: string;
}) {
  // 1. userId で紐づけ済み確認
  const linked = await prisma.customer.findUnique({
    where: { userId: user.id },
    select: CUSTOMER_LINK_SELECT,
  });
  if (linked) return linked;

  // 2. email で既存 Customer 検索 → userId 紐づけ
  const byEmail = await prisma.customer.findUnique({
    where: { email: user.email },
    select: CUSTOMER_LINK_SELECT,
  });
  if (byEmail) {
    return prisma.customer.update({
      where: { id: byEmail.id },
      data: { userId: user.id },
      select: CUSTOMER_LINK_SELECT,
    });
  }

  // 3. 新規作成（競合状態対策付き）
  try {
    return await prisma.customer.create({
      data: {
        email: user.email,
        lastName: user.name || "未設定",
        firstName: "",
        userId: user.id,
      },
      select: CUSTOMER_LINK_SELECT,
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      // 別タブ等で同時に作成された場合 → 再取得
      const fallback = await prisma.customer.findUnique({
        where: { userId: user.id },
        select: CUSTOMER_LINK_SELECT,
      });
      if (fallback) return fallback;
    }
    throw e;
  }
}
```

- [ ] **Step 7: テスト実行**

Run: `bun test __tests__/unit/shared/domain/customers/link.test.ts`
Expected: PASS

- [ ] **Step 8: validate 実行**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 9: コミット**

```bash
git add src/shared/domain/customers/ src/shared/domain/settings/public-queries.ts __tests__/unit/shared/domain/customers/
git commit -m "feat(domain): add ensureCustomerLinked and public settings queries"
```

---

## Task 6: 顧客用予約クエリ + コマンド

**Files:**

- Create: `src/shared/domain/reservations/customer-queries.ts`
- Create: `src/shared/domain/reservations/customer-commands.ts`
- Create: `src/shared/lib/validations/customer-reservation.ts`
- Create: `__tests__/unit/shared/lib/validations/customer-reservation.test.ts`
- Modify: `src/shared/domain/reservations/commands.ts`

- [ ] **Step 1: 顧客用予約変更の Zod スキーマテストを書く**

Create `__tests__/unit/shared/lib/validations/customer-reservation.test.ts`:

- 有効データで success
- spaceId 欠如で failure
- date フォーマット不正で failure
- startTime >= endTime で failure
- numberOfGuests 0以下で failure

- [ ] **Step 2: テストが失敗することを確認**

Run: `bun test __tests__/unit/shared/lib/validations/customer-reservation.test.ts`
Expected: FAIL

- [ ] **Step 3: customer-reservation.ts スキーマを実装**

Create `src/shared/lib/validations/customer-reservation.ts`:

```typescript
import { z } from "zod";

export const customerReservationEditSchema = z
  .object({
    reservationId: z.string().uuid(),
    spaceId: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    numberOfGuests: z.number().int().min(1),
  })
  .refine((data) => data.startTime < data.endTime, {
    message: "終了時間は開始時間より後にしてください",
    path: ["endTime"],
  });
```

- [ ] **Step 4: テストが通ることを確認**

Run: `bun test __tests__/unit/shared/lib/validations/customer-reservation.test.ts`
Expected: PASS

- [ ] **Step 5: 顧客用予約クエリを実装**

Create `src/shared/domain/reservations/customer-queries.ts`:

```typescript
import { prisma } from "@/shared/db/prisma";

const CUSTOMER_RESERVATION_SELECT = {
  id: true,
  startTime: true,
  endTime: true,
  status: true,
  totalPrice: true,
  numberOfGuests: true,
  notes: true,
  createdAt: true,
  space: { select: { id: true, name: true, slug: true } },
  location: { select: { id: true, name: true } },
} as const;

export async function getCustomerReservations(customerId: string) {
  return prisma.reservation.findMany({
    where: { customerId },
    select: CUSTOMER_RESERVATION_SELECT,
    orderBy: { startTime: "desc" },
  });
}

export async function getCustomerReservationDetail(
  reservationId: string,
  customerId: string,
) {
  return prisma.reservation.findFirst({
    where: { id: reservationId, customerId },
    select: {
      ...CUSTOMER_RESERVATION_SELECT,
      coupon: {
        select: {
          id: true,
          code: true,
          discountType: true,
          discountValue: true,
        },
      },
      manualDiscountAmount: true,
    },
  });
}
```

- [ ] **Step 6: 顧客用予約コマンドを実装**

Create `src/shared/domain/reservations/customer-commands.ts`:

```typescript
import { prisma } from "@/shared/db/prisma";
import { ReservationStatus } from "@prisma/client";
import { isWithinDeadline } from "./deadline";
import { DomainError } from "@/shared/lib/errors";

export async function cancelCustomerReservation(
  reservationId: string,
  customerId: string,
  deadlineHours: number,
) {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findFirst({
      where: { id: reservationId, customerId },
      select: {
        id: true,
        status: true,
        startTime: true,
        couponId: true,
        coupon: { select: { id: true } },
      },
    });
    if (!reservation) throw new DomainError("NOT_FOUND");

    // ステータス検証: PENDING or CONFIRMED のみキャンセル可
    if (
      ![ReservationStatus.PENDING, ReservationStatus.CONFIRMED].includes(
        reservation.status,
      )
    ) {
      return { success: false, error: "この予約はキャンセルできません" };
    }

    // 期限チェック
    if (!isWithinDeadline(reservation.startTime, deadlineHours)) {
      return {
        success: false,
        error: `キャンセル期限（${deadlineHours}時間前）を過ぎています`,
      };
    }

    // キャンセル実行
    await tx.reservation.update({
      where: { id: reservationId },
      data: { status: ReservationStatus.CANCELLED },
    });

    // クーポン usageCount デクリメント（既存フィールド名は usageCount）
    if (reservation.couponId) {
      await tx.coupon.update({
        where: { id: reservation.couponId },
        data: { usageCount: { decrement: 1 } },
      });
    }

    return {
      success: true,
      payload: { reservationId, customerId, type: "cancel" },
    };
  });
}

export async function updateCustomerReservation(
  reservationId: string,
  customerId: string,
  data: {
    spaceId: string;
    date: string;
    startTime: string;
    endTime: string;
    numberOfGuests: number;
  },
  deadlineHours: number,
) {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findFirst({
      where: { id: reservationId, customerId },
      select: {
        id: true,
        status: true,
        startTime: true,
        manualDiscountAmount: true,
        couponId: true,
      },
    });
    if (!reservation) throw new DomainError("NOT_FOUND");

    // 手動割引チェック
    if (
      reservation.manualDiscountAmount &&
      Number(reservation.manualDiscountAmount) > 0
    ) {
      return {
        success: false,
        error: "手動割引が適用されている予約は管理者にお問い合わせください",
      };
    }

    // 期限チェック
    if (!isWithinDeadline(reservation.startTime, deadlineHours)) {
      return {
        success: false,
        error: `変更期限（${deadlineHours}時間前）を過ぎています`,
      };
    }

    // TODO: 空き状況チェック + 料金再計算（既存の availability ロジックを使用）
    // → checkAvailability(data.spaceId, startDateTime, endDateTime, reservationId)
    // → calculateReservationPrice(space, duration, numberOfGuests)

    await tx.reservation.update({
      where: { id: reservationId },
      data: {
        spaceId: data.spaceId,
        startTime: new Date(`${data.date}T${data.startTime}`),
        endTime: new Date(`${data.date}T${data.endTime}`),
        numberOfGuests: data.numberOfGuests,
        // totalPrice: recalculated price
      },
    });

    return {
      success: true,
      payload: { reservationId, customerId, type: "update" },
    };
  });
}
```

- [ ] **Step 7: 顧客用コマンドのテストを書く**

Create `__tests__/unit/shared/domain/reservations/customer-commands.test.ts`:

テストケース:

- `cancelCustomerReservation`: PENDING → CANCELLED 成功
- `cancelCustomerReservation`: 期限切れで失敗
- `cancelCustomerReservation`: COMPLETED ステータスで失敗
- `cancelCustomerReservation`: 他人の予約でエラー
- `cancelCustomerReservation`: クーポン付き → usageCount デクリメント
- `updateCustomerReservation`: 正常変更成功
- `updateCustomerReservation`: 手動割引ありで拒否
- `updateCustomerReservation`: 期限切れで失敗

- [ ] **Step 8: resolveOrCreateCustomer に userId 引数を追加**

`src/shared/domain/reservations/commands.ts` の `resolveOrCreateCustomer` を修正:

```typescript
async function resolveOrCreateCustomer(
  tx: Tx,
  data: CustomerData,
  userId?: string,  // 追加
): Promise<string> {
  if (userId) {
    const existing = await tx.customer.findUnique({ where: { userId }, select: { id: true } });
    if (existing) {
      await tx.customer.update({
        where: { id: existing.id },
        data: { lastName: data.lastName, firstName: data.firstName,
                phoneNumber: data.phoneNumber || null, companyName: data.companyName || null },
      });
      return existing.id;
    }
  }
  // 既存の email upsert ロジック（変更なし）
  const customer = await tx.customer.upsert({ ... });
  return customer.id;
}
```

- [ ] **Step 9: validate 実行**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 10: コミット**

```bash
git add src/shared/domain/reservations/ src/shared/lib/validations/ __tests__/
git commit -m "feat(domain): add customer reservation queries, commands, and validation"
```

---

## Task 7: ログインページ

**Files:**

- Create: `src/app/(public)/login/page.tsx`
- Create: `src/app/(public)/login/_components/social-login-buttons.tsx`

- [ ] **Step 1: ログインページ（Server Component）を作成**

`src/app/(public)/login/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/shared/lib/auth";
import { SocialLoginButtons } from "./_components/social-login-buttons";
// Design System から直接 import（barrel 禁止）
import { Container } from "@/public/components/design-system/container";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/mypage");

  return (
    <Container size="sm">
      <Stack gap="lg" className="py-16">
        <Heading level={1} align="center">ログイン</Heading>
        <p className="text-center text-muted-foreground">
          アカウントに連携して、予約の確認や変更が簡単にできます。
        </p>
        <SocialLoginButtons />
      </Stack>
    </Container>
  );
}
```

- [ ] **Step 2: ソーシャルログインボタン（Client Component）を作成**

`src/app/(public)/login/_components/social-login-buttons.tsx`:

```typescript
"use client";

import { signIn } from "@/shared/lib/auth-client";
import { Button } from "@/public/components/design-system/button";
import { Stack } from "@/public/components/design-system/stack";

export function SocialLoginButtons() {
  return (
    <Stack gap="md">
      <Button
        variant="outline"
        size="lg"
        className="w-full"
        onClick={() => signIn.social({ provider: "google", callbackURL: "/mypage" })}
      >
        Googleでログイン
      </Button>
      <Button
        variant="outline"
        size="lg"
        className="w-full"
        onClick={() => signIn.social({ provider: "line", callbackURL: "/mypage" })}
      >
        LINEでログイン
      </Button>
    </Stack>
  );
}
```

- [ ] **Step 3: type-check 実行**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add 'src/app/(public)/login/'
git commit -m "feat(public): add social login page with Google/LINE buttons"
```

---

## Task 8: マイページレイアウト + ダッシュボード

**Files:**

- Create: `src/app/(public)/mypage/layout.tsx`
- Create: `src/app/(public)/mypage/page.tsx`
- Create: `src/app/(public)/mypage/_components/mypage-nav.tsx`
- Create: `src/app/(public)/mypage/_components/reservation-list.tsx`
- Create: `src/app/(public)/mypage/_components/reservation-card.tsx`

- [ ] **Step 1: マイページレイアウト（認証 + ensureCustomerLinked）を作成**

`src/app/(public)/mypage/layout.tsx`:

```typescript
import { redirect } from "next/navigation";
import { verifyCustomerSession } from "@/shared/lib/auth";
import { ensureCustomerLinked } from "@/shared/domain/customers/link";
import { Container } from "@/public/components/design-system/container";
import { MypageNav } from "./_components/mypage-nav";

export default async function MypageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await verifyCustomerSession();
  const customer = await ensureCustomerLinked(user);

  // LINE でメール未取得の場合 → 設定ページでメール入力を必須化
  // pathname が /mypage/settings でない場合のみリダイレクト（無限ループ防止）
  if (!customer.email) {
    redirect("/mypage/settings?require_email=true");
  }

  return (
    <Container size="lg" className="py-8">
      <MypageNav />
      {children}
    </Container>
  );
}
```

- [ ] **Step 2: マイページナビゲーションを作成**

`src/app/(public)/mypage/_components/mypage-nav.tsx`:

```typescript
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/mypage", label: "予約一覧" },
  { href: "/mypage/settings", label: "アカウント設定" },
];

export function MypageNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-4 border-b border-border mb-8 pb-2">
      {NAV_ITEMS.map((item) => {
        const isActive =
          item.href === "/mypage"
            ? pathname === "/mypage"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={isActive ? "text-primary font-medium border-b-2 border-primary" : "text-muted-foreground"}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 3: 予約一覧ページを作成**

`src/app/(public)/mypage/page.tsx`:

```typescript
import { verifyCustomerSession } from "@/shared/lib/auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { getCustomerReservations } from "@/shared/domain/reservations/customer-queries";
import { getReservationDeadlineSettings } from "@/shared/domain/settings/public-queries";
import { ReservationList } from "./_components/reservation-list";
import { Heading } from "@/public/components/design-system/heading";

export default async function MypageDashboard() {
  const { user } = await verifyCustomerSession();
  const customer = await getCustomerByUserId(user.id);
  if (!customer) redirect("/login");

  const [reservations, deadlineSettings] = await Promise.all([
    getCustomerReservations(customer.id),
    getReservationDeadlineSettings(),
  ]);

  return (
    <>
      <Heading level={1}>予約一覧</Heading>
      <ReservationList
        reservations={reservations}
        cancellationDeadlineHours={deadlineSettings.cancellationDeadlineHours}
        modificationDeadlineHours={deadlineSettings.modificationDeadlineHours}
      />
    </>
  );
}
```

- [ ] **Step 4: 予約カードコンポーネントを作成**

`src/app/(public)/mypage/_components/reservation-card.tsx`:

日時、スペース名、人数、料金、ステータスバッジ、期限内なら変更/キャンセルリンクを表示。

- [ ] **Step 5: 予約一覧コンポーネントを作成**

`src/app/(public)/mypage/_components/reservation-list.tsx`:

予約配列を受け取り、ReservationCard を map。空の場合は「予約がありません」表示。

- [ ] **Step 6: type-check 実行**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add 'src/app/(public)/mypage/'
git commit -m "feat(mypage): add layout, dashboard, and reservation list"
```

---

## Task 9: 予約詳細 + キャンセル

**Files:**

- Create: `src/app/(public)/mypage/reservations/[id]/page.tsx`
- Create: `src/app/(public)/mypage/reservations/[id]/_components/reservation-detail.tsx`
- Create: `src/app/(public)/mypage/reservations/[id]/_components/cancel-button.tsx`
- Create: `src/app/(public)/mypage/_shared/actions/reservation.ts`

- [ ] **Step 1: マイページ用 Server Actions を作成**

`src/app/(public)/mypage/_shared/actions/reservation.ts`:

```typescript
"use server";

import { getSession } from "@/shared/lib/auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { cancelCustomerReservation } from "@/shared/domain/reservations/customer-commands";
import { getReservationDeadlineSettings } from "@/shared/domain/settings/public-queries";

export async function cancelReservationAction(reservationId: string) {
  const session = await getSession();
  if (!session) return { error: "認証が必要です" };

  const customer = await getCustomerByUserId(session.user.id);
  if (!customer) return { error: "顧客情報が見つかりません" };

  const settings = await getReservationDeadlineSettings();
  const deadlineHours = settings.cancellationDeadlineHours;

  const result = await cancelCustomerReservation(
    reservationId,
    customer.id,
    deadlineHours,
  );

  if (!result.success) return { error: result.error };

  // メール通知は payload から（既存パターン）
  return { success: true };
}
```

- [ ] **Step 2: 予約詳細ページを作成**

`src/app/(public)/mypage/reservations/[id]/page.tsx`:

認証 → customerId 取得 → 予約詳細取得 → 所有者チェック → ReservationDetail 表示。

- [ ] **Step 3: 予約詳細コンポーネントを作成**

日時、スペース情報、料金内訳、ステータス、ゲスト数を表示。

- [ ] **Step 4: キャンセルボタンコンポーネントを作成**

`cancel-button.tsx`: 確認ダイアログ付き。期限内の場合のみ表示。`cancelReservationAction` を呼び出し。

- [ ] **Step 5: type-check 実行**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add 'src/app/(public)/mypage/'
git commit -m "feat(mypage): add reservation detail and cancel functionality"
```

---

## Task 10: 予約変更

**Files:**

- Create: `src/app/(public)/mypage/reservations/[id]/edit/page.tsx`
- Create: `src/app/(public)/mypage/reservations/[id]/edit/_components/edit-reservation-form.tsx`
- Modify: `src/app/(public)/mypage/_shared/actions/reservation.ts`

- [ ] **Step 1: updateReservationAction を Server Actions に追加**

`src/app/(public)/mypage/_shared/actions/reservation.ts` に追加:

- セッション・顧客認証
- 手動割引チェック（ある場合は変更拒否）
- 期限チェック
- `updateCustomerReservation` コマンド呼び出し
- 料金再計算結果を返却

- [ ] **Step 2: 予約変更ページを作成**

`src/app/(public)/mypage/reservations/[id]/edit/page.tsx`:

認証 → 予約取得 → 所有者チェック → 期限チェック → 手動割引チェック → EditReservationForm 表示。

- [ ] **Step 3: 予約変更フォームを作成**

`edit-reservation-form.tsx` — `usePublicForm` パターンに従う。主要な要素:

1. **スペース選択**: 同ロケーション内のスペース一覧（既存の `space-selector.tsx` を参考）
2. **日時選択**: 既存の `date-time-section.tsx` コンポーネントを再利用。空き状況チェックは既存の `checkAvailability` Server Action（`src/app/(public)/_shared/actions/availability.ts`）を呼び出し。変更前の予約は除外（`excludeReservationId` パラメータ）
3. **人数入力**: number input
4. **料金プレビュー**: 日時・スペース変更時にサーバーから料金を再計算して表示
5. **確認 + 送信**: `updateReservationAction` を呼び出し、成功時は `/mypage/reservations/[id]` にリダイレクト
6. **Turnstile**: 既存の Turnstile ウィジェットで bot 対策（`usePublicForm` に組み込み済み）

- [ ] **Step 4: type-check 実行**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add 'src/app/(public)/mypage/'
git commit -m "feat(mypage): add reservation edit functionality"
```

---

## Task 11: アカウント設定ページ

**Files:**

- Create: `src/app/(public)/mypage/settings/page.tsx`
- Create: `src/app/(public)/mypage/settings/_components/profile-form.tsx`
- Create: `src/app/(public)/mypage/settings/_components/account-linking.tsx`
- Create: `src/app/(public)/mypage/_shared/actions/profile.ts`
- Create: `src/app/(public)/mypage/_shared/actions/account.ts`

- [ ] **Step 1: プロフィール更新 Server Action を作成**

`src/app/(public)/mypage/_shared/actions/profile.ts`:

セッション認証 → Customer 取得 → lastName, firstName, phoneNumber を更新。

- [ ] **Step 2: アカウント連携 Server Actions を作成**

`src/app/(public)/mypage/_shared/actions/account.ts`:

- `getAccountLinksAction()` → User の Account 一覧を取得（プロバイダー名）
- `deleteAccountAction()` → Better Auth の `auth.api.deleteUser()` を Server Action から呼び出し。`onDelete: SetNull` により `Customer.userId` と `Reservation.userId` は自動的に null になる。Session/Account は `onDelete: Cascade` で自動削除。Customer レコードと予約履歴はビジネスデータとして保持。

- [ ] **Step 3: 設定ページを作成**

`src/app/(public)/mypage/settings/page.tsx`:

認証 → Customer 取得 → Account 一覧取得 → ProfileForm + AccountLinking 表示。名前未入力バナー表示。

- [ ] **Step 4: プロフィール編集フォームを作成**

`profile-form.tsx`: 姓・名・電話番号。メールは表示のみ（変更不可）。`usePublicForm` パターン。

- [ ] **Step 5: アカウント連携管理コンポーネントを作成**

`account-linking.tsx`:

- Google: 連携済み ✓ [解除] / 未連携 [連携する]
- LINE: 同上
- 連携: `linkSocial({ provider })` を呼び出し
- 解除: Better Auth API で Account 削除（最後の1つは解除不可）
- アカウント削除セクション

- [ ] **Step 6: type-check 実行**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add 'src/app/(public)/mypage/'
git commit -m "feat(mypage): add settings page with profile edit and account linking"
```

---

## Task 12: 予約フォームのログイン連携

**Files:**

- Modify: `src/app/(public)/reservation/_components/reservation-form.tsx`
- Modify: `src/app/(public)/reservation/_components/customer-step.tsx`
- Modify: `src/app/(public)/_shared/actions/reservation.ts`
- Modify: `src/app/(public)/reservation/page.tsx`

- [ ] **Step 1: 予約ページでセッション情報を取得**

`reservation/page.tsx` で `getCurrentUser()` を呼び、ログイン済みなら Customer 情報を取得して ReservationForm に渡す。

- [ ] **Step 2: ReservationForm にプリフィルデータを受け渡し**

`reservation-form.tsx` に `prefillData?: { lastName, firstName, email, phoneNumber, companyName }` prop を追加。

- [ ] **Step 3: customer-step.tsx でプリフィル対応**

ログイン済みの場合、フォームの初期値にプリフィルデータをセット（編集可能）。

- [ ] **Step 4: 公開予約 Server Action に userId を渡す**

`_shared/actions/reservation.ts` で `getCurrentUser()` を呼び、userId を `resolveOrCreateCustomer` に渡す。予約作成時に `Reservation.userId` もセット。

- [ ] **Step 5: 予約完了画面に「アカウント連携」案内を追加**

未ログインの場合のみ表示: 「次回から入力を省略するにはアカウント連携がおすすめです」+ `/login` へのリンク。

- [ ] **Step 6: validate 実行**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add 'src/app/(public)/reservation/' 'src/app/(public)/_shared/actions/'
git commit -m "feat(reservation): add login prefill and account linking prompt"
```

---

## Task 13: 管理画面の顧客連携表示

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/customers/[id]/_components/CustomerDetail.tsx`
- Modify: `src/shared/domain/customers/queries.ts`

- [ ] **Step 1: 顧客クエリに Account 情報を含める**

`queries.ts` の顧客詳細取得で `user: { select: { accounts: { select: { providerId: true } } } }` を追加。

- [ ] **Step 2: CustomerDetail にアカウント連携表示を追加**

`CustomerDetail.tsx` に新しいセクション:

```
アカウント連携: Google ✓ / LINE ✗
```

Customer.userId が null なら「未連携」と表示。

- [ ] **Step 3: type-check 実行**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add 'src/app/(admin)/' src/shared/domain/customers/
git commit -m "feat(admin): show account linking status on customer detail"
```

---

## Task 14: ヘッダーにログイン/マイページリンク追加

**Files:**

- Modify: `src/app/(public)/_shared/components/layouts/` (ヘッダー関連ファイル)

- [ ] **Step 1: ヘッダーコンポーネントを確認**

`src/app/(public)/_shared/components/layouts/` 内のヘッダーファイルを確認し、ナビゲーションリンクの追加箇所を特定。

- [ ] **Step 2: ログイン状態に応じたリンクを追加**

- 未ログイン: 「ログイン」リンク → `/login`
- ログイン済み (CUSTOMER ロール): 「マイページ」リンク → `/mypage`
- ログイン済み (ADMIN 系ロール): 既存の管理画面リンクを維持

`getCurrentUser()` を Server Component で呼び、結果に応じてリンクを切り替え。

- [ ] **Step 3: モバイルナビにも同様のリンクを追加**

`src/app/(public)/_shared/components/layouts/mobile-nav.tsx` にも同じリンクを追加。

- [ ] **Step 4: type-check 実行**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add 'src/app/(public)/_shared/components/layouts/'
git commit -m "feat(public): add login/mypage link to header navigation"
```

---

## Task 15: 最終検証

- [ ] **Step 1: 全テスト実行**

Run: `bun run test`
Expected: ALL PASS

- [ ] **Step 2: validate 実行**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 3: ビルド実行**

Run: `bun run build`
Expected: PASS

- [ ] **Step 4: 最終コミット（必要があれば）**

修正が必要な場合のみ。

---

## 環境構築メモ（実装者向け）

### LINE Login セットアップ

1. [LINE Developers Console](https://developers.line.biz/console/) でチャネル作成
2. チャネルタイプ: LINE Login
3. Callback URL: `http://localhost:3000/api/auth/callback/line`（開発時）
4. スコープ: `openid`, `profile`, `email` を有効化
5. `.env` に追加:

```
LINE_CLIENT_ID=your_channel_id
LINE_CLIENT_SECRET=your_channel_secret
```

### Google OAuth 変更

既存の `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` はそのまま使用。Calendar スコープを OAuth ログインから除外するのはコード側で対応済み。
