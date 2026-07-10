# BLACKLIST顧客の新規予約/申込ブロック Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `CustomerStatus.BLACKLIST`の顧客(ログイン済み本人、または既存の未紐付けゲストと同じメール)による新規の空間予約・イベント申込を拒否する。

**Architecture:** 新規の読み取り専用ガード関数`ensureCustomerNotBlacklisted`を`src/shared/domain/customers/guard.ts`に1つ追加し、既存の`createPublicReservationCommand`(空間予約)と`createEventRegistrationCommand`(イベント申込)のtx内、顧客解決/lock取得の直後に1行ずつ差し込む。

**Tech Stack:** TypeScript / Prisma 7 / bun:test

## Global Constraints

- Prisma import は `src/shared/domain` 配下のみ許可。`guard.ts`は`import "server-only"`必須(`db-domain.md`)。
- `CustomerStatus`は`@/shared/lib/validations/enums/prisma-types`経由でimportする(app層のgateway規約)。
- テストは必ず`bun scripts/run-tests.ts <path>`経由で実行する。素の`bun test`は禁止。
- migrationは不要(既存enum値のみ使用)。
- コミット前に`bun run validate && bun run build`を実行する。

---

## 参照: 設計spec

`docs/superpowers/specs/2026-07-11-blacklist-customer-reservation-block-design.md`

## テスト方針の補足(実装前に確定した判断)

- `createPublicReservationCommand`には既存のunit testファイルが無く、新規作成すると10個以上の依存(resolveOrCreateCustomer, ensureDateNotBlocked, ensureNoOverlap, getReservationSettings等)を全モックする必要があり非効率。代わりに実DB統合テストを新規作成する(`registration-overbooking.test.ts`と同じパターン、`isFeatureEnabled`はmockでバイパス)。
- `createEventRegistrationCommand`には既存のunit test(全mock)があるため、そこに`customer`モデルのモックを追加してケースを増やす方が効率的。
- `ensureCustomerNotBlacklisted({ customerId }, tx)`の呼び出しはログイン済み・ゲストのどちらでも同一シグネチャ(`resolveOrCreateCustomer`が返した`customerId`をそのまま渡すだけ)。customerId経路のBLACKLIST判定自体はTask 1の`guard.test.ts`で完全にカバーされるため、Task 2の実DB統合テストは「ゲストのemail検索経路」1本に絞り、User行作成という別の複雑さ(Better Auth連携)を持つログイン済み経路の実DB再現は行わない。

---

### Task 1: `ensureCustomerNotBlacklisted` ガード関数

**Files:**

- Create: `src/shared/domain/customers/guard.ts`
- Test: `__tests__/unit/domain/customers/guard.test.ts`

**Interfaces:**

- Produces: `ensureCustomerNotBlacklisted(params: { customerId?: string | null; email?: string }, tx?: GuardTx): Promise<void>` — `customerId`があればそれで、なければ`email`の未紐付けゲストCustomerで`status`を検索し、`BLACKLIST`なら`DomainError(message, "FORBIDDEN")`をthrow。両方無ければno-op。

- [ ] **Step 1: 失敗するテストを書く**

`__tests__/unit/domain/customers/guard.test.ts`を新規作成:

```ts
import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockFindUnique = mock<
  (args: Record<string, unknown>) => Promise<{ status: string } | null>
>(() => Promise.resolve(null));

const mockFindFirst = mock<
  (args: Record<string, unknown>) => Promise<{ status: string } | null>
>(() => Promise.resolve(null));

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    customer: {
      findUnique: mockFindUnique,
      findFirst: mockFindFirst,
    },
  },
}));

import { ensureCustomerNotBlacklisted } from "@/shared/domain/customers/guard";

const mockTx = {
  customer: { findUnique: mockFindUnique, findFirst: mockFindFirst },
};

describe("ensureCustomerNotBlacklisted", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockFindFirst.mockReset();
    mockFindUnique.mockResolvedValue(null);
    mockFindFirst.mockResolvedValue(null);
  });

  test("customerId指定 + BLACKLIST → FORBIDDENでthrow", async () => {
    mockFindUnique.mockResolvedValueOnce({ status: "BLACKLIST" });

    await expect(
      ensureCustomerNotBlacklisted({ customerId: "cust-1" }, mockTx),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cust-1" },
      }),
    );
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  test("customerId指定 + 非BLACKLIST → 素通り", async () => {
    mockFindUnique.mockResolvedValueOnce({ status: "REGULAR" });

    await expect(
      ensureCustomerNotBlacklisted({ customerId: "cust-1" }, mockTx),
    ).resolves.toBeUndefined();
  });

  test("email指定(customerIdなし) + 既存ゲストBLACKLIST → FORBIDDENでthrow", async () => {
    mockFindFirst.mockResolvedValueOnce({ status: "BLACKLIST" });

    await expect(
      ensureCustomerNotBlacklisted({ email: "Taro@Example.com" }, mockTx),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { emailCanonical: "taro@example.com", userId: null },
      }),
    );
  });

  test("email指定 + 該当customerなし → 素通り", async () => {
    await expect(
      ensureCustomerNotBlacklisted({ email: "new@example.com" }, mockTx),
    ).resolves.toBeUndefined();
  });

  test("customerId・emailどちらも未指定 → no-op（検索しない）", async () => {
    await expect(
      ensureCustomerNotBlacklisted({}, mockTx),
    ).resolves.toBeUndefined();

    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  test("customerIdがnull + emailあり → emailで検索する", async () => {
    mockFindFirst.mockResolvedValueOnce({ status: "BLACKLIST" });

    await expect(
      ensureCustomerNotBlacklisted(
        { customerId: null, email: "guest@example.com" },
        mockTx,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("tx省略時は prisma シングルトンを使用", async () => {
    mockFindUnique.mockResolvedValueOnce({ status: "REGULAR" });

    await expect(
      ensureCustomerNotBlacklisted({ customerId: "cust-1" }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/domain/customers/guard.test.ts`
Expected: FAIL(`Cannot find module '@/shared/domain/customers/guard'` 等、対象ファイルが存在しないため)

- [ ] **Step 3: `guard.ts`を実装する**

`src/shared/domain/customers/guard.ts`を新規作成:

```ts
import "server-only";

import { prisma } from "@/shared/db/prisma";
import { CustomerStatus } from "@/shared/lib/validations/enums/prisma-types";
import { DomainError } from "@/shared/domain/domain-error";
import { normalizeEmailForIdentity } from "@/shared/lib/email/normalize-email";

// ---------------------------------------------------------------------------
// ensureCustomerNotBlacklisted — read-only 拒否判定ガード
// ---------------------------------------------------------------------------
// - customerId があればそれで Customer.status を直接検索する。
// - customerId が無く email があれば、未紐付けゲスト Customer（userId: null）
//   のみを email 一致で検索する（新規作成はしない、read-only）。
// - どちらの検索でも該当 Customer が無ければ no-op（素通り）。
// - status が BLACKLIST なら DomainError(FORBIDDEN) を throw する。
// ---------------------------------------------------------------------------

export interface GuardTx {
  readonly customer: {
    findUnique(args: object): Promise<{ status: CustomerStatus } | null>;
    findFirst(args: object): Promise<{ status: CustomerStatus } | null>;
  };
}

const BLACKLISTED_MESSAGE =
  "現在このご予約を承ることができません。お手数ですがお問い合わせフォームよりご連絡ください。";

export async function ensureCustomerNotBlacklisted(
  params: { customerId?: string | null; email?: string },
  tx?: GuardTx,
): Promise<void> {
  const db = tx ?? prisma;

  const customer = params.customerId
    ? await db.customer.findUnique({
        where: { id: params.customerId },
        select: { status: true },
      })
    : params.email
      ? await db.customer.findFirst({
          where: {
            emailCanonical: normalizeEmailForIdentity(params.email),
            userId: null,
          },
          select: { status: true },
        })
      : null;

  if (customer?.status === CustomerStatus.BLACKLIST) {
    throw new DomainError(BLACKLISTED_MESSAGE, "FORBIDDEN");
  }
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/domain/customers/guard.test.ts`
Expected: PASS(7 tests)

- [ ] **Step 5: 型チェック**

Run: `bun run type-check`
Expected: エラー0件

- [ ] **Step 6: コミット**

```bash
git add src/shared/domain/customers/guard.ts __tests__/unit/domain/customers/guard.test.ts
git commit -m "feat(customers): add BLACKLIST customer guard for new reservations"
```

---

### Task 2: 空間予約への統合 + 実DB統合テスト

**Files:**

- Modify: `src/shared/domain/reservations/public-commands.ts:1-23`(import)、`:143-156`(呼び出し追加)
- Test: `__tests__/integration/domain/reservations/blacklist-guard.test.ts`(新規、実DB必須)

**Interfaces:**

- Consumes: `ensureCustomerNotBlacklisted(params, tx)` from Task 1(`@/shared/domain/customers/guard`)

- [ ] **Step 1: 失敗する統合テストを書く**

`__tests__/integration/domain/reservations/blacklist-guard.test.ts`を新規作成:

```ts
/**
 * BLACKLIST顧客による新規予約作成の拒否を検証する統合テスト（実 DB 必須）。
 *
 * `createPublicReservationCommand` は `resolveOrCreateCustomer` で解決した
 * `customerId` を使って `ensureCustomerNotBlacklisted` を呼ぶ。この結合を
 * mock ではなく実際のトランザクション内で検証する。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行。`bun run test:integration` が
 * docker-compose の test-db 既定値を注入する。
 */

import { describe, test, expect, beforeAll, afterAll, mock } from "bun:test";
import { CustomerStatus } from "@generated/prisma/enums";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

// createPublicReservationCommand は isFeatureEnabled("reservation") を直接呼ぶ。
// この real-DB テストは Settings の feature module シーディングとは無関係な
// ガード検証が目的のため、registration-overbooking.test.ts と同じ mock
// パターンで gate 自体をバイパスする。
mock.module("@/shared/lib/features/check", () => ({
  isFeatureEnabled: () => Promise.resolve(true),
}));

type PrismaModule = typeof import("@/shared/db/prisma");
type CommandsModule =
  typeof import("@/shared/domain/reservations/public-commands");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];
let createPublicReservationCommand: CommandsModule["createPublicReservationCommand"];

async function createTestLocationAndSpace(): Promise<{
  locationId: string;
  spaceId: string;
}> {
  const suffix = crypto.randomUUID();

  const location = await basePrisma.location.create({
    data: {
      slug: `blacklist-guard-loc-${suffix}`,
      name: `Blacklist Guard Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/location.jpg",
      isActive: false,
    },
    select: { id: true },
  });

  const space = await basePrisma.space.create({
    data: {
      slug: `blacklist-guard-space-${suffix}`,
      name: `Blacklist Guard Space ${suffix}`,
      descriptionJson: { type: "doc" },
      descriptionHtml: "<p>test</p>",
      descriptionPlainText: "test",
      capacity: 10,
      hourlyPrice: 1000,
      mainImageUrl: "https://example.com/space.jpg",
      locationId: location.id,
      isPublished: true,
      isActive: true,
    },
    select: { id: true },
  });

  return { locationId: location.id, spaceId: space.id };
}

async function cleanupFixture(
  locationId: string,
  spaceId: string,
  email: string,
): Promise<void> {
  await basePrisma.reservation.deleteMany({ where: { spaceId } });
  await basePrisma.space.deleteMany({ where: { id: spaceId } });
  await basePrisma.location.deleteMany({ where: { id: locationId } });
  await basePrisma.customer.deleteMany({ where: { email } });
}

describeMaybe("createPublicReservationCommand — BLACKLIST guard", () => {
  beforeAll(async () => {
    ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
    ({ createPublicReservationCommand } =
      await import("@/shared/domain/reservations/public-commands"));
    await basePrisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await basePrisma.$disconnect();
  });

  test("既存のBLACKLISTゲストCustomerと同じメールでの新規ゲスト予約は拒否される", async () => {
    const { locationId, spaceId } = await createTestLocationAndSpace();
    const email = `blacklist-guard-${crypto.randomUUID()}@example.com`;

    await basePrisma.customer.create({
      data: {
        lastName: "拒否",
        firstName: "太郎",
        email,
        emailCanonical: email,
        status: CustomerStatus.BLACKLIST,
      },
    });

    try {
      await expect(
        createPublicReservationCommand({
          spaceId,
          date: "2027-01-15",
          startTime: "10:00",
          endTime: "12:00",
          lastName: "拒否",
          firstName: "太郎",
          email,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      const count = await prisma.reservation.count({ where: { spaceId } });
      expect(count).toBe(0);
    } finally {
      await cleanupFixture(locationId, spaceId, email);
    }
  }, 30_000);

  test("通常のゲスト予約は成立する（regression）", async () => {
    const { locationId, spaceId } = await createTestLocationAndSpace();
    const email = `blacklist-guard-ok-${crypto.randomUUID()}@example.com`;

    try {
      const result = await createPublicReservationCommand({
        spaceId,
        date: "2027-01-15",
        startTime: "10:00",
        endTime: "12:00",
        lastName: "通常",
        firstName: "花子",
        email,
      });

      expect(result.id).toBeTruthy();
      const count = await prisma.reservation.count({ where: { spaceId } });
      expect(count).toBe(1);
    } finally {
      await cleanupFixture(locationId, spaceId, email);
    }
  }, 30_000);
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `bun run test:integration __tests__/integration/domain/reservations/blacklist-guard.test.ts`
Expected: FAIL(「通常のゲスト予約」は既存実装のまま通り、「BLACKLIST拒否」テストが`rejects.toMatchObject`で失敗 — 実際には予約が成立してしまう)

- [ ] **Step 3: `public-commands.ts`にガード呼び出しを追加する**

`src/shared/domain/reservations/public-commands.ts`のimportブロック(1-23行目)に追加:

```ts
import { ensureCustomerNotBlacklisted } from "@/shared/domain/customers/guard";
```

`resolveOrCreateCustomer`呼び出し(143-154行目)の直後、`tx.reservation.create`(156行目)の前に追加:

```ts
    const customerId = await resolveOrCreateCustomer(
      {
        lastName: input.lastName,
        firstName: input.firstName,
        email: input.email,
        phoneNumber: input.phoneNumber,
        companyName: input.companyName,
        customerType: input.customerType,
        userId: input.userId,
      },
      tx,
    );

    await ensureCustomerNotBlacklisted({ customerId }, tx);

    const created = await tx.reservation.create({
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `bun run test:integration __tests__/integration/domain/reservations/blacklist-guard.test.ts`
Expected: PASS(2 tests)

- [ ] **Step 5: 既存の予約関連テストにregressionが無いことを確認する**

Run: `bun scripts/run-tests.ts __tests__/integration/actions/public/reservation.test.ts`
Expected: PASS(既存テストは`createPublicReservationCommand`自体をモックしているため無影響のはず)

- [ ] **Step 6: コミット**

```bash
git add src/shared/domain/reservations/public-commands.ts __tests__/integration/domain/reservations/blacklist-guard.test.ts
git commit -m "feat(reservations): block new reservations from BLACKLIST customers"
```

---

### Task 3: イベント申込への統合 + 既存unit testへのケース追加

**Files:**

- Modify: `src/shared/domain/events/registration-commands.ts:1-9`(import)、`:44`(呼び出し追加)
- Modify: `__tests__/unit/domain/events/registration-commands.test.ts`(既存ファイルにmock追加・テスト追加)

**Interfaces:**

- Consumes: `ensureCustomerNotBlacklisted(params, tx)` from Task 1(`@/shared/domain/customers/guard`)

- [ ] **Step 1: 既存unit testファイルにmockとテストケースを追加する（失敗させる）**

`__tests__/unit/domain/events/registration-commands.test.ts`の以下3箇所を変更する。

(a) mock関数定義(既存の`mockRegistrationUpdateMany`定義の直後、67行目付近)に追加:

```ts
const mockCustomerFindUnique = mock<() => Promise<{ status: string } | null>>(
  () => Promise.resolve(null),
);
const mockCustomerFindFirst = mock<() => Promise<{ status: string } | null>>(
  () => Promise.resolve(null),
);
```

(b) `mock.module("@/shared/db/prisma", ...)`(既存83-104行目)の`tx`オブジェクトに`customer`を追加:

```ts
mock.module("@/shared/db/prisma", () => {
  const tx = {
    $executeRaw: mockExecuteRaw,
    event: { findFirst: mockEventFindFirst },
    eventTimeSlot: { findUnique: mockSlotFindUnique },
    eventTicket: { findFirst: mockTicketFindFirst },
    eventRegistration: {
      aggregate: mockRegistrationAggregate,
      create: mockRegistrationCreate,
    },
    customer: {
      findUnique: mockCustomerFindUnique,
      findFirst: mockCustomerFindFirst,
    },
  };
  return {
    prisma: {
      $transaction: (cb: (client: typeof tx) => Promise<unknown>) => cb(tx),
      eventRegistration: {
        findFirst: mockRegistrationFindFirst,
        update: mockRegistrationUpdate,
        updateMany: mockRegistrationUpdateMany,
      },
    },
  };
});
```

(c) `beforeEach`(既存158-184行目)に追加:

```ts
beforeEach(() => {
  mockEventFindFirst.mockReset();
  mockSlotFindUnique.mockReset();
  mockTicketFindFirst.mockReset();
  mockRegistrationAggregate.mockReset();
  mockRegistrationCreate.mockReset();
  mockIsFeatureEnabled.mockReset();
  mockCustomerFindUnique.mockReset();
  mockCustomerFindFirst.mockReset();

  mockIsFeatureEnabled.mockImplementation(() => Promise.resolve(true));
  mockEventFindFirst.mockImplementation(() => Promise.resolve(BASE_EVENT));
  mockSlotFindUnique.mockImplementation(() => Promise.resolve(BASE_SLOT));
  mockTicketFindFirst.mockImplementation(() => Promise.resolve(BASE_TICKET));
  mockRegistrationAggregate.mockImplementation(() =>
    Promise.resolve({ _sum: { quantity: 0 } }),
  );
  mockRegistrationCreate.mockImplementation(() =>
    Promise.resolve({
      id: "reg-1",
      eventId: "event-1",
      ticketId: "ticket-1",
      name: "山田太郎",
      email: "yamada@example.com",
      quantity: 1,
      icsSequence: 0,
    }),
  );
  mockCustomerFindUnique.mockImplementation(() => Promise.resolve(null));
  mockCustomerFindFirst.mockImplementation(() => Promise.resolve(null));
});
```

(d) 既存の`describe("createEventRegistrationCommand", ...)`ブロック内、`describe("異常系: per-ticket capacity", ...)`の直後に新規ブロックを追加:

```ts
describe("BLACKLIST guard", () => {
  test("ログイン済み(customerId指定)のBLACKLIST顧客は拒否される", async () => {
    mockCustomerFindUnique.mockImplementation(() =>
      Promise.resolve({ status: "BLACKLIST" }),
    );

    await expect(
      createEventRegistrationCommand({
        ...VALID_INPUT,
        customerId: "cust-blacklisted",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mockRegistrationCreate).not.toHaveBeenCalled();
  });

  test("既存ゲストBLACKLIST Customerと同じメールのゲスト申込は拒否される", async () => {
    mockCustomerFindFirst.mockImplementation(() =>
      Promise.resolve({ status: "BLACKLIST" }),
    );

    await expect(
      createEventRegistrationCommand({ ...VALID_INPUT }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mockCustomerFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { emailCanonical: "yamada@example.com", userId: null },
      }),
    );
    expect(mockRegistrationCreate).not.toHaveBeenCalled();
  });

  test("BLACKLISTでなければ通常通り申込が作成される", async () => {
    const result = await createEventRegistrationCommand(VALID_INPUT);
    expect(result.registration.id).toBe("reg-1");
  });
});
```

- [ ] **Step 2: テストを実行して新規ケースの失敗を確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/domain/events/registration-commands.test.ts`
Expected: FAIL(新規追加した「BLACKLIST guard」の最初の2ケースのみ失敗、既存ケースはPASS)

- [ ] **Step 3: `registration-commands.ts`にガード呼び出しを追加する**

`src/shared/domain/events/registration-commands.ts`のimportブロック(1-8行目)に追加:

```ts
import { ensureCustomerNotBlacklisted } from "@/shared/domain/customers/guard";
```

advisory lock取得(44行目)の直後、`event.findFirst`(46行目)の前に追加:

```ts
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(728350::int4, hashtext(${data.eventId}))`;

      await ensureCustomerNotBlacklisted(
        { customerId: data.customerId, email: data.email },
        tx,
      );

      const event = await tx.event.findFirst({
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/domain/events/registration-commands.test.ts`
Expected: PASS(全ケース)

- [ ] **Step 5: 型チェック**

Run: `bun run type-check`
Expected: エラー0件

- [ ] **Step 6: コミット**

```bash
git add src/shared/domain/events/registration-commands.ts __tests__/unit/domain/events/registration-commands.test.ts
git commit -m "feat(events): block new registrations from BLACKLIST customers"
```

---

### Task 4: 最終検証・PR作成

**Files:** なし(検証のみ)

- [ ] **Step 1: 全体検証**

Run: `bun run validate`
Expected: type-check + lint ともにエラー0件

- [ ] **Step 2: architecture-boundaries含むunitテスト全体**

Run: `bun run test:unit`
Expected: 全PASS(既存テストにregressionが無いこと含む)

- [ ] **Step 3: integrationテスト全体**

Run: `bun run test:integration`
Expected: 全PASS(Docker test-dbが自動起動する)

- [ ] **Step 4: ビルド確認**

Run: `bun run build`
Expected: 成功

- [ ] **Step 5: push + PR作成**

```bash
git push -u origin <current-branch>
gh pr create --base main --title "feat: BLACKLIST顧客の新規予約/申込をブロック" --body "$(cat <<'EOF'
## Summary
- 管理者が顧客をBLACKLIST化しても、本人(ログイン済み)や同じメールのゲストが新規の空間予約・イベント申込を作成できてしまう穴を塞ぐ
- 新規の読み取り専用ガード `ensureCustomerNotBlacklisted` を追加し、既存の予約作成・イベント申込作成のtx内に統合

## Test plan
- [x] `guard.ts` unit test（customerId/email 各経路 × BLACKLIST/非BLACKLIST/該当なし）
- [x] 空間予約: 実DB統合テスト（BLACKLISTゲスト拒否 + 通常ゲスト成立のregression）
- [x] イベント申込: 既存unit testにBLACKLISTケース追加（ログイン済み経路・ゲスト経路）
- [x] `bun run validate && bun run build`

Design spec: docs/superpowers/specs/2026-07-11-blacklist-customer-reservation-block-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr merge --auto --squash --delete-branch
```

---

## Self-Review

- **Spec coverage**: 設計specのゴール1(ログイン済み拒否)→Task1のcustomerIdテスト+Task3のcustomerIdテスト、ゴール2(既存ゲスト拒否)→Task1のemailテスト+Task2/Task3のemailテスト、ゴール3(両経路対称)→Task2・Task3で同一`ensureCustomerNotBlacklisted`を使用、ゴール4(汎用エラーメッセージ)→`guard.ts`の`BLACKLISTED_MESSAGE`。非ゴール(isActive除外・Phase1維持・既存予約not-touch・UI not-touch)はいずれのタスクでも変更していない。テスト方針の3ケース(ログイン済み拒否/既存ゲスト拒否/regression)は前述の「テスト方針の補足」でTask2をゲスト経路に絞る判断を明記済み。
- **Placeholder scan**: 全ステップに完全なコードを記載済み。TBD/TODOなし。
- **Type consistency**: `GuardTx`(Task1)は`{ customer: { findUnique, findFirst } }`のみを要求し、Task2/Task3で渡す`tx`(Prisma TransactionClient)はいずれも構造的に上位互換。`ensureCustomerNotBlacklisted(params, tx)`のシグネチャはTask2・Task3で共通。
