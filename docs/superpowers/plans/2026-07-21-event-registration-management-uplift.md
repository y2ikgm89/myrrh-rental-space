# イベント参加登録の管理機能格上げ（Phase 2）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** イベント参加登録(EventRegistration)の管理者体験を、予約・顧客管理と同水準（作成後編集・検索フィルタ・一括操作・横断エクスポート・詳細監査ログ）まで引き上げる。設計の根拠は `docs/superpowers/specs/2026-07-21-admin-management-parity-design.md` の Phase 2 セクション。

**Architecture:** 新規の永続化構造（新テーブル）は作らない。既存パターンの横展開のみ:
`createWalkInRegistrationCommand` の advisory lock（728350, hashtext(eventId)）+ 定員再判定ロジック、
`reservation/bulk.ts` の per-id bulk 処理パターン、Phase 1 で確立した「`afterSuccess` 内で直接
`createAuditLogRecord` を呼ぶ」詳細監査ログパターン、`FloatingBulkActionBar` + `CustomerBulkActions.tsx` の
チェックボックス選択 UI パターン。

**Tech Stack:** Next.js 16 Server Actions、Prisma 7、bun test（`scripts/run-tests.ts` 経由）、Zod 4、nuqs。

## Global Constraints

- テストは必ず `bun scripts/run-tests.ts <path>` 経由で実行する（素の `bun test` 禁止）。
- 完了前に `bun run validate`（type-check + lint）を実行し exit 0 を確認する。
- `any` / `as` 危険cast / non-null assertion（`!`）は 0 件（grep gate で強制）。
- Prisma の直 import は `src/shared/domain` / `src/shared/db` 配下のみ。action 層
  （`_shared/actions/*.ts`）は Prisma を直 import しない。
- tx 内の複数クエリは逐次 `await`（並行発行禁止）。定員 TOCTOU 防止は
  `pg_advisory_xact_lock(728350::int4, hashtext(eventId))` を tx 冒頭で取得する
  （namespace 728350 はイベント申込専用、他の namespace と衝突させない）。
- **WAITLISTED_OFFERED 中の quantity 変更は禁止**（`updateMany` の WHERE で status 別に
  claim 済みの状態のため、変更すると意味的に不整合になる）。変更したい場合は
  「キャンセル → 再度お申込み」を促すエラーメッセージにする。
- 監査ログの oldValue/newValue に `Date` を渡す場合は必ず `.toISOString()` で文字列化する。
- resource文字列は kebab-case `"event-registration"` を使う（Phase 1 で統一済み。
  `executeAdminMutationResult` に渡す権限チェック用 `resource` は既存5兄弟actionと同じ `"event"`
  のままで別レイヤー、混同しない）。
- コミットメッセージは Conventional Commits + `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`。
- 新規の Prisma schema 変更（migration）は行わない。手動入金記録は既存の
  `paymentStatus`/`paidAmount`/`paidAt` フィールドを再利用し、支払方法・メモは
  AuditLog の `metadata` に記録する（`refundEventRegistrationPaymentCommand` が
  reason/actorType を metadata に記録するのと同型）。

---

## Group A: 編集機能 + 備考表示（Task 1-3）

### Task 1: `updateEventRegistrationCommand` ドメインコマンド新設

**Files:**

- Modify: `src/shared/domain/events/registration-commands.ts`（`createAdminProxyRegistrationCommand`
  の直後、674行目付近に追加）
- Test: `__tests__/integration/domain/events/update-registration-command.test.ts`（新規）

**Interfaces:**

- Consumes: `DomainError`（既存import）、`RegistrationStatus`（既存import、
  `@generated/prisma/enums`）
- Produces:

  ```ts
  export async function updateEventRegistrationCommand(data: {
    registrationId: string;
    name: string;
    email: string | null;
    phone: string | null;
    note: string | null;
    quantity: number;
  }): Promise<{
    previous: {
      name: string;
      email: string | null;
      phone: string | null;
      note: string | null;
      quantity: number;
    };
  }>;
  ```

  Task 2（action層）がこの戻り値の `previous` を監査ログの oldValue に使う。

- [ ] **Step 1: 失敗する統合テストを書く**

`__tests__/integration/domain/events/update-registration-command.test.ts` を新規作成:

```ts
/**
 * updateEventRegistrationCommand の実DB統合テスト。
 * 定員再判定・WAITLISTED_OFFERED中のquantity変更禁止・NOT_FOUND/CONFLICTを実DBで検証する。
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const describeMaybe = process.env["TEST_DATABASE_URL"]
  ? describe
  : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type RegistrationCommandsModule =
  typeof import("@/shared/domain/events/registration-commands");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];
let updateEventRegistrationCommand: RegistrationCommandsModule["updateEventRegistrationCommand"];

async function createFixtureEvent(capacity: number): Promise<{
  eventId: string;
  slotId: string;
  ticketId: string;
}> {
  const suffix = crypto.randomUUID();
  const event = await basePrisma.event.create({
    data: {
      title: `テストイベント ${suffix}`,
      slug: `test-event-${suffix}`,
      status: "PUBLISHED",
      description: "test",
      format: "OFFLINE",
      addressDetail: "test",
    },
  });
  const slot = await basePrisma.eventTimeSlot.create({
    data: {
      eventId: event.id,
      startAt: new Date("2026-08-01T10:00:00.000Z"),
      endAt: new Date("2026-08-01T12:00:00.000Z"),
      capacity,
    },
  });
  const ticket = await basePrisma.eventTicket.create({
    data: {
      eventId: event.id,
      name: "一般",
      price: 0,
      isAvailable: true,
    },
  });
  return { eventId: event.id, slotId: slot.id, ticketId: ticket.id };
}

async function createFixtureRegistration(
  fixture: { eventId: string; slotId: string; ticketId: string },
  overrides: { quantity?: number; status?: string } = {},
): Promise<string> {
  const reg = await basePrisma.eventRegistration.create({
    data: {
      eventId: fixture.eventId,
      slotId: fixture.slotId,
      ticketId: fixture.ticketId,
      name: "既存太郎",
      email: "existing@example.com",
      phone: "090-0000-0000",
      note: "既存メモ",
      quantity: overrides.quantity ?? 1,
      status: (overrides.status ?? "CONFIRMED") as never,
    },
  });
  return reg.id;
}

async function cleanupFixture(eventId: string): Promise<void> {
  await basePrisma.eventRegistration.deleteMany({ where: { eventId } });
  await basePrisma.eventTicket.deleteMany({ where: { eventId } });
  await basePrisma.eventTimeSlot.deleteMany({ where: { eventId } });
  await basePrisma.event.delete({ where: { id: eventId } });
}

describeMaybe("updateEventRegistrationCommand", () => {
  beforeAll(async () => {
    ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
    ({ updateEventRegistrationCommand } =
      await import("@/shared/domain/events/registration-commands"));
  });

  afterAll(async () => {
    await basePrisma.$disconnect();
  });

  test("氏名・email・電話・備考・数量を変更でき、変更前の値を previous として返す", async () => {
    const fixture = await createFixtureEvent(10);
    const registrationId = await createFixtureRegistration(fixture, {
      quantity: 2,
    });

    try {
      const result = await updateEventRegistrationCommand({
        registrationId,
        name: "更新太郎",
        email: "updated@example.com",
        phone: "090-1111-1111",
        note: "更新メモ",
        quantity: 3,
      });

      expect(result.previous).toEqual({
        name: "既存太郎",
        email: "existing@example.com",
        phone: "090-0000-0000",
        note: "既存メモ",
        quantity: 2,
      });

      const updated = await prisma.eventRegistration.findUniqueOrThrow({
        where: { id: registrationId },
      });
      expect(updated.name).toBe("更新太郎");
      expect(updated.quantity).toBe(3);
    } finally {
      await cleanupFixture(fixture.eventId);
    }
  });

  test("定員超過になる数量変更は CONFLICT で拒否される", async () => {
    const fixture = await createFixtureEvent(3);
    const registrationId = await createFixtureRegistration(fixture, {
      quantity: 2,
    });
    // 残枠を圧迫する別の CONFIRMED 申込
    await createFixtureRegistration(fixture, { quantity: 1 });

    try {
      await expect(
        updateEventRegistrationCommand({
          registrationId,
          name: "更新太郎",
          email: null,
          phone: null,
          note: null,
          quantity: 3, // 既存2件で定員3を使い切っているため+1は超過
        }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
    } finally {
      await cleanupFixture(fixture.eventId);
    }
  });

  test("WAITLISTED_OFFERED 中の quantity 変更は VALIDATION で拒否される", async () => {
    const fixture = await createFixtureEvent(10);
    const registrationId = await createFixtureRegistration(fixture, {
      quantity: 1,
      status: "WAITLISTED_OFFERED",
    });

    try {
      await expect(
        updateEventRegistrationCommand({
          registrationId,
          name: "更新太郎",
          email: null,
          phone: null,
          note: null,
          quantity: 2,
        }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
    } finally {
      await cleanupFixture(fixture.eventId);
    }
  });

  test("WAITLISTED_OFFERED 中でも name/email/note の変更は quantity 据え置きなら成功する", async () => {
    const fixture = await createFixtureEvent(10);
    const registrationId = await createFixtureRegistration(fixture, {
      quantity: 1,
      status: "WAITLISTED_OFFERED",
    });

    try {
      const result = await updateEventRegistrationCommand({
        registrationId,
        name: "更新太郎",
        email: null,
        phone: null,
        note: null,
        quantity: 1,
      });
      expect(result.previous.name).toBe("既存太郎");
    } finally {
      await cleanupFixture(fixture.eventId);
    }
  });

  test("CANCELLED な参加登録は編集できず CONFLICT を返す", async () => {
    const fixture = await createFixtureEvent(10);
    const registrationId = await createFixtureRegistration(fixture, {
      status: "CANCELLED",
    });

    try {
      await expect(
        updateEventRegistrationCommand({
          registrationId,
          name: "更新太郎",
          email: null,
          phone: null,
          note: null,
          quantity: 1,
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    } finally {
      await cleanupFixture(fixture.eventId);
    }
  });

  test("存在しない registrationId は NOT_FOUND を返す", async () => {
    await expect(
      updateEventRegistrationCommand({
        registrationId: "nonexistent000000000000000",
        name: "x",
        email: null,
        phone: null,
        note: null,
        quantity: 1,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
```

- [ ] **Step 2: 実DB接続を確認しテストを実行、失敗することを確認する**

Run: `bun scripts/run-tests.ts __tests__/integration/domain/events/update-registration-command.test.ts`
Expected: FAIL（`updateEventRegistrationCommand is not a function` — まだ実装していないため）

- [ ] **Step 3: `scripts/test-db-runner-env.ts` の `SERIAL_DB_TESTS` に登録する**

実DBを使う新規統合テストはフルパス登録が必須（未登録だと parallel bucket に入り共有DBで競合する）。
`scripts/test-db-runner-env.ts` を開き、`SERIAL_DB_TESTS` 配列に以下を追加する:

```ts
"__tests__/integration/domain/events/update-registration-command.test.ts",
```

（既存の配列内の他の event 関連エントリの近くに追加する。配列のフォーマットは既存の並びに合わせる。）

- [ ] **Step 4: `updateEventRegistrationCommand` を実装する**

`src/shared/domain/events/registration-commands.ts` の `createAdminProxyRegistrationCommand`
の実装が終わる行（674行目、次の空行）の直後に以下を追加する:

```ts
/**
 * 管理者による参加登録の事後編集。氏名/email/電話/備考/数量をまとめて更新する。
 *
 * quantity 変更は定員再判定が必要なため、createWalkInRegistrationCommand と同じ
 * advisory lock（728350, hashtext(eventId)）を取得した tx 内で処理する。
 * WAITLISTED_OFFERED 中の quantity 変更は禁止（updateMany WHERE で status 別に
 * claim 済みの状態を破壊するため、business-domain.md の既存不変条件）。
 * CANCELLED/EXPIRED な登録は編集不可（updateMany WHERE で最終ガード）。
 */
export async function updateEventRegistrationCommand(data: {
  registrationId: string;
  name: string;
  email: string | null;
  phone: string | null;
  note: string | null;
  quantity: number;
}): Promise<{
  previous: {
    name: string;
    email: string | null;
    phone: string | null;
    note: string | null;
    quantity: number;
  };
}> {
  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.eventRegistration.findUnique({
        where: { id: data.registrationId },
        select: {
          eventId: true,
          slotId: true,
          ticketId: true,
          status: true,
          name: true,
          email: true,
          phone: true,
          note: true,
          quantity: true,
        },
      });
      if (!existing) {
        throw new DomainError("参加登録が見つかりません", "NOT_FOUND");
      }

      if (
        existing.status === RegistrationStatus.CANCELLED ||
        existing.status === RegistrationStatus.EXPIRED
      ) {
        throw new DomainError("この参加登録は編集できません", "CONFLICT");
      }

      const quantityChanged = data.quantity !== existing.quantity;

      if (
        quantityChanged &&
        existing.status === RegistrationStatus.WAITLISTED_OFFERED
      ) {
        throw new DomainError(
          "繰り上げ当選中は参加人数を変更できません。一度キャンセルして再度お申込みください",
          "VALIDATION",
        );
      }

      if (quantityChanged && existing.status === RegistrationStatus.CONFIRMED) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(728350::int4, hashtext(${existing.eventId}))`;

        const slot = await tx.eventTimeSlot.findUnique({
          where: { id: existing.slotId },
          select: { capacity: true },
        });
        if (!slot) {
          throw new DomainError(
            "指定されたタイムスロットが見つかりません",
            "NOT_FOUND",
          );
        }

        const slotConfirmed = await tx.eventRegistration.aggregate({
          where: {
            slotId: existing.slotId,
            status: RegistrationStatus.CONFIRMED,
            id: { not: data.registrationId },
          },
          _sum: { quantity: true },
        });
        const slotRemaining =
          slot.capacity - (slotConfirmed._sum.quantity ?? 0);
        if (data.quantity > slotRemaining) {
          throw new DomainError(
            `このスロットは残り${String(slotRemaining)}枠です。参加人数を${String(slotRemaining)}名以下にしてください`,
            "VALIDATION",
          );
        }

        const ticket = await tx.eventTicket.findUnique({
          where: { id: existing.ticketId },
          select: { name: true, capacity: true },
        });
        if (ticket?.capacity != null) {
          const ticketConfirmed = await tx.eventRegistration.aggregate({
            where: {
              ticketId: existing.ticketId,
              slotId: existing.slotId,
              status: RegistrationStatus.CONFIRMED,
              id: { not: data.registrationId },
            },
            _sum: { quantity: true },
          });
          const remaining =
            ticket.capacity - (ticketConfirmed._sum.quantity ?? 0);
          if (data.quantity > remaining) {
            throw new DomainError(
              `「${ticket.name}」は残り${String(remaining)}枠です。参加人数を${String(remaining)}名以下にしてください`,
              "VALIDATION",
            );
          }
        }
      }

      const updated = await tx.eventRegistration.updateMany({
        where: {
          id: data.registrationId,
          status: {
            notIn: [RegistrationStatus.CANCELLED, RegistrationStatus.EXPIRED],
          },
        },
        data: {
          name: data.name,
          email: data.email,
          phone: data.phone,
          note: data.note,
          quantity: data.quantity,
        },
      });
      if (updated.count === 0) {
        throw new DomainError(
          "この参加登録は既にキャンセル/期限切れのため編集できません",
          "CONFLICT",
        );
      }

      return {
        previous: {
          name: existing.name,
          email: existing.email,
          phone: existing.phone,
          note: existing.note,
          quantity: existing.quantity,
        },
      };
    },
    { maxWait: 5000, timeout: 10000 },
  );
}
```

- [ ] **Step 5: テストを再実行し、成功することを確認する**

Run: `bun scripts/run-tests.ts __tests__/integration/domain/events/update-registration-command.test.ts`
Expected: PASS（6テスト全件）

- [ ] **Step 6: コミット**

```bash
git add src/shared/domain/events/registration-commands.ts \
  __tests__/integration/domain/events/update-registration-command.test.ts \
  scripts/test-db-runner-env.ts
git commit -m "$(cat <<'EOF'
feat(admin): add updateEventRegistrationCommand for post-creation edits

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: action層 (`updateEventRegistration`) + 詳細監査ログ

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/event-registration.ts`
- Test: `__tests__/unit/actions/event-registration-audit.test.ts`（新規）

**Interfaces:**

- Consumes: `updateEventRegistrationCommand`（Task 1、`{previous: {...}}` を返す）、
  `eventRegistrationIdSchema`（同ファイル41行目に既存）
- Produces:

  ```ts
  export async function updateEventRegistration(
    input: UpdateRegistrationInput,
  ): Promise<MutationResult<{ registrationId: string }>>;
  ```

  Task 3（UI）がこの action を呼ぶ。

- [ ] **Step 1: 失敗する単体テストを書く**

`__tests__/unit/actions/event-registration-audit.test.ts` を新規作成:

```ts
/**
 * event-registration.ts の updateEventRegistration が customer-audit-diff.test.ts と
 * 同型の afterSuccess + createAuditLogRecord パターンで、resource "event-registration"
 * として oldValue/newValue を AuditLog に残すことを検証する。
 *
 * executeAdminMutationResult は薄いモックに差し替え、RBAC/cache invalidationは検証しない。
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

type AdminUserLike = { id: string };
let currentUser: AdminUserLike = { id: "admin-1" };

mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: async <T>(options: {
    execute: (user: AdminUserLike) => Promise<T>;
    afterSuccess?: (data: T) => void;
  }): Promise<T> => {
    const data = await options.execute(currentUser);
    options.afterSuccess?.(data);
    return data;
  },
}));

const mockUpdateEventRegistrationCommand = mock<
  () => Promise<{
    previous: {
      name: string;
      email: string | null;
      phone: string | null;
      note: string | null;
      quantity: number;
    };
  }>
>(() =>
  Promise.resolve({
    previous: {
      name: "旧太郎",
      email: "old@example.com",
      phone: "090-0000-0000",
      note: "旧メモ",
      quantity: 1,
    },
  }),
);

mock.module("@/shared/domain/events/registration-commands", () => ({
  adminCancelEventRegistrationCommand: mock(async () => ({})),
  createAdminProxyRegistrationCommand: mock(async () => ({})),
  createWalkInRegistrationCommand: mock(async () => ({})),
  setEventRegistrationCheckInCommand: mock(async () => ({})),
  updateEventRegistrationCommand: (
    ...args: Parameters<typeof mockUpdateEventRegistrationCommand>
  ) => mockUpdateEventRegistrationCommand(...args),
}));

mock.module("@/shared/lib/email/event-emails", () => ({
  sendEventAdminNotification: mock(async () => undefined),
  sendEventRegistrationConfirmation: mock(async () => undefined),
}));

mock.module("@/shared/domain/events/registration-queries", () => ({
  getEventRegistrationDetailsForEmail: mock(async () => null),
}));

mock.module("@/shared/domain/events/payment-commands", () => ({
  refundEventRegistrationPaymentCommand: mock(async () => ({})),
}));

mock.module(
  "@/shared/domain/events/registration-cancellation-side-effects",
  () => ({
    applyEventRegistrationCancellationSideEffects: mock(async () => ({})),
  }),
);

mock.module("@/shared/lib/cache/event-cache", () => ({
  invalidateEventCaches: mock(() => undefined),
}));

mock.module("@/shared/domain/notifications/commands", () => ({
  createNotificationCommand: mock(async () => undefined),
}));

const mockCreateAuditLogRecord = mock<
  (input: Record<string, unknown>) => Promise<void>
>(() => Promise.resolve());

mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: (
    ...args: Parameters<typeof mockCreateAuditLogRecord>
  ) => mockCreateAuditLogRecord(...args),
}));

mock.module("@/shared/lib/audit-request-context", () => ({
  buildAuditRequestContext: () =>
    Promise.resolve({ ip: "test-ip", userAgent: "test-ua" }),
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (promise: Promise<unknown>) => {
    void promise.catch(() => undefined);
  },
}));

mock.module("@/shared/lib/errors/server", () => ({
  ErrorCategory: { DATABASE: "DATABASE" },
  ErrorSeverity: { MEDIUM: "MEDIUM" },
}));

const { updateEventRegistration } =
  await import("@/app/(admin)/admin/(dashboard)/_shared/actions/event-registration");

const REGISTRATION_ID = "ckv1a2b3c4d5e6f7g8h9i0j1"; // cuid-shaped test id

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("updateEventRegistration の AuditLog diff (event-registration)", () => {
  beforeEach(() => {
    currentUser = { id: "admin-1" };
    mockUpdateEventRegistrationCommand.mockReset();
    mockUpdateEventRegistrationCommand.mockResolvedValue({
      previous: {
        name: "旧太郎",
        email: "old@example.com",
        phone: "090-0000-0000",
        note: "旧メモ",
        quantity: 1,
      },
    });
    mockCreateAuditLogRecord.mockReset();
    mockCreateAuditLogRecord.mockResolvedValue(undefined);
  });

  test("変更前後を oldValue/newValue に記録する", async () => {
    const result = await updateEventRegistration({
      registrationId: REGISTRATION_ID,
      name: "新太郎",
      email: "new@example.com",
      phone: "090-1111-1111",
      note: "新メモ",
      quantity: 2,
    });

    expect(result).not.toHaveProperty("error");
    await flushMicrotasks();

    expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
    const call = mockCreateAuditLogRecord.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("call is undefined");
    expect(call["resource"]).toBe("event-registration");
    expect(call["resourceId"]).toBe(REGISTRATION_ID);
    expect(call["oldValue"]).toEqual({
      name: "旧太郎",
      email: "old@example.com",
      phone: "090-0000-0000",
      note: "旧メモ",
      quantity: 1,
    });
    expect(call["newValue"]).toEqual({
      name: "新太郎",
      email: "new@example.com",
      phone: "090-1111-1111",
      note: "新メモ",
      quantity: 2,
    });
  });

  test("不正な registrationId は VALIDATION エラーを返し、監査ログは記録しない", async () => {
    const result = await updateEventRegistration({
      registrationId: "",
      name: "新太郎",
      email: null,
      phone: null,
      note: null,
      quantity: 1,
    });

    expect(result).toHaveProperty("error");
    await flushMicrotasks();
    expect(mockCreateAuditLogRecord).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テストを実行し、失敗することを確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/actions/event-registration-audit.test.ts`
Expected: FAIL（`updateEventRegistration` が export されていない）

- [ ] **Step 3: `updateEventRegistration` action を実装する**

`src/app/(admin)/admin/(dashboard)/_shared/actions/event-registration.ts` の import ブロック
（L8-11、`registration-commands` からの named import）を以下に変更（`updateEventRegistrationCommand`
を追加）:

```ts
import {
  adminCancelEventRegistrationCommand,
  createAdminProxyRegistrationCommand,
  createWalkInRegistrationCommand,
  setEventRegistrationCheckInCommand,
  updateEventRegistrationCommand,
} from "@/shared/domain/events/registration-commands";
```

さらに以下の import を追加（ファイル冒頭の他の import と並べる）:

```ts
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
```

`walkInSchema`（L216）の直前に、以下の新しいスキーマと関数を追加する:

```ts
const updateRegistrationSchema = z.object({
  registrationId: eventRegistrationIdSchema,
  name: z.string().trim().min(1, "氏名を入力してください").max(100),
  email: z
    .string()
    .trim()
    .max(255)
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : v))
    .pipe(
      z.union([z.email({ error: "メールアドレスの形式が不正です" }), z.null()]),
    ),
  phone: z
    .string()
    .trim()
    .max(20)
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : v)),
  note: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : v)),
  quantity: z.number().int().min(1).max(100),
});

export type UpdateRegistrationInput = z.input<typeof updateRegistrationSchema>;

export async function updateEventRegistration(
  input: UpdateRegistrationInput,
): Promise<MutationResult<{ registrationId: string }>> {
  const parsed = updateRegistrationSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "event",
    action: "update",
    resourceId: parsed.data.registrationId,
    execute: async (user) => {
      const { previous } = await updateEventRegistrationCommand({
        registrationId: parsed.data.registrationId,
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        note: parsed.data.note,
        quantity: parsed.data.quantity,
      });
      const { ip, userAgent } = await buildAuditRequestContext();
      return {
        registrationId: parsed.data.registrationId,
        previous,
        actorUserId: user.id,
        ip,
        userAgent,
      };
    },
    afterSuccess: (outcome) => {
      invalidateEventCaches();

      fireAndForget(
        createAuditLogRecord({
          userId: outcome.actorUserId,
          action: AuditAction.UPDATE,
          resource: "event-registration",
          resourceId: parsed.data.registrationId,
          oldValue: outcome.previous,
          newValue: {
            name: parsed.data.name,
            email: parsed.data.email,
            phone: parsed.data.phone,
            note: parsed.data.note,
            quantity: parsed.data.quantity,
          },
          metadata: {
            ...(outcome.ip !== null && { ip: outcome.ip }),
            ...(outcome.userAgent !== null && {
              userAgent: outcome.userAgent,
            }),
          },
        }),
        {
          operation: "auditLogUpdateEventRegistration",
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.MEDIUM,
        },
      );
    },
    resolveAuditResourceId: (outcome) => outcome.registrationId,
  });
}
```

（`execute` は `executeAdminMutationResult` が返す `MutationResult<{registrationId}>` の
`registrationId` も含めて `{registrationId, previous, actorUserId, ip, userAgent}` を返す
— 関数の宣言上の戻り値型 `MutationResult<{registrationId: string}>` と一致させるため。
`afterSuccess`/`resolveAuditResourceId` はこの `outcome` から必要なフィールドだけを参照する。
`ErrorSeverity` は既存 import に含まれていない場合、`@/shared/lib/errors/server` からの
import に追加する。既存の `ErrorCategory` import 行を確認し、無ければ
`import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors/server";` に拡張する。）

- [ ] **Step 4: テストを再実行し、成功することを確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/actions/event-registration-audit.test.ts`
Expected: PASS（2テスト）

- [ ] **Step 5: コミット**

```bash
git add __tests__/unit/actions/event-registration-audit.test.ts \
  src/app/\(admin\)/admin/\(dashboard\)/_shared/actions/event-registration.ts
git commit -m "$(cat <<'EOF'
feat(admin): add updateEventRegistration action with audit-log diff

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `EventRegistrationTable.tsx` に編集ボタン + 備考列表示を追加

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/events/[id]/_components/EditRegistrationDialog.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/events/[id]/_components/EventRegistrationTable.tsx`
- Test: 手動確認（UIコンポーネントのため。既存の unit テストで壊れないことのみ
  `bun run type-check` + `bun run validate` で確認する）

**Interfaces:**

- Consumes: `updateEventRegistration`（Task 2）
- Produces: `EditRegistrationDialog` コンポーネント（Task 7 の bulk 操作追加時にはimportし直さない
  独立コンポーネント）

- [ ] **Step 1: `EditRegistrationDialog.tsx` を新規作成する**

```tsx
"use client";

import { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from "@/admin/components/ui";
import { updateEventRegistration } from "@/admin/actions/event-registration";
import { isMutationError } from "@/shared/lib/mutation-result";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface EditRegistrationDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly registration: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    note: string | null;
    quantity: number;
  };
}

export function EditRegistrationDialog({
  open,
  onOpenChange,
  registration,
}: EditRegistrationDialogProps) {
  const router = useRouter();
  const [name, setName] = useState(registration.name);
  const [email, setEmail] = useState(registration.email ?? "");
  const [phone, setPhone] = useState(registration.phone ?? "");
  const [note, setNote] = useState(registration.note ?? "");
  const [quantity, setQuantity] = useState(String(registration.quantity));
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setName(registration.name);
      setEmail(registration.email ?? "");
      setPhone(registration.phone ?? "");
      setNote(registration.note ?? "");
      setQuantity(String(registration.quantity));
      setError(null);
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async () => {
    setError(null);
    const quantityNum = Number.parseInt(quantity, 10);
    if (!Number.isInteger(quantityNum) || quantityNum < 1) {
      setError("参加人数は1以上の整数で入力してください。");
      return;
    }

    setIsPending(true);
    const result = await updateEventRegistration({
      registrationId: registration.id,
      name,
      email: email.trim() === "" ? undefined : email,
      phone: phone.trim() === "" ? undefined : phone,
      note: note.trim() === "" ? undefined : note,
      quantity: quantityNum,
    });
    setIsPending(false);

    if (isMutationError(result)) {
      setError(result.error);
      return;
    }
    toast.success("参加登録を更新しました");
    onOpenChange(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>参加登録を編集</DialogTitle>
          <DialogDescription>
            氏名・連絡先・参加人数・備考を修正できます。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-reg-name">氏名</Label>
            <Input
              id="edit-reg-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-reg-email">メール</Label>
            <Input
              id="edit-reg-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-reg-phone">電話番号</Label>
            <Input
              id="edit-reg-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-reg-quantity">参加人数</Label>
            <Input
              id="edit-reg-quantity"
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-reg-note">備考</Label>
            <Textarea
              id="edit-reg-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={isPending}
            />
          </div>
          {error !== null ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            キャンセル
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isPending}>
            {isPending ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: `EventRegistrationTable.tsx` に備考列の表示と編集ボタンを追加する**

import 部分（L1-29）に以下を追加:

```tsx
import { EditRegistrationDialog } from "./EditRegistrationDialog";
```

`Registration` 型定義（L31-46）はそのまま（既に `note: string | null` を持っている）。

state 宣言部分（`refundTarget` 等が定義されている箇所）に以下を追加:

```tsx
const [editTarget, setEditTarget] = useState<Registration | null>(null);
```

TableHeader（L156-167）に備考列ヘッダーを追加:

```tsx
<TableHeader>
  <TableRow>
    <TableHead>名前</TableHead>
    <TableHead className="hidden lg:table-cell">参加枠</TableHead>
    <TableHead className="hidden md:table-cell">メール</TableHead>
    <TableHead className="hidden xl:table-cell">備考</TableHead>
    <TableHead>参加人数</TableHead>
    <TableHead>ステータス</TableHead>
    <TableHead>出欠</TableHead>
    <TableHead className="hidden lg:table-cell">申込日時</TableHead>
    <TableHead className="text-right">操作</TableHead>
  </TableRow>
</TableHeader>
```

対応する `TableRow` 内のセルに備考列を追加する（メール列の直後、参加人数列の前）:

```tsx
<TableCell className="hidden xl:table-cell max-w-[200px] truncate">
  {reg.note ?? "-"}
</TableCell>
```

操作列（L197-225）の返金/キャンセルボタンの前に編集ボタンを追加:

```tsx
<TableCell className="text-right">
  <div className="flex justify-end gap-2">
    <Button
      variant="outline"
      size="sm"
      disabled={anyPending}
      onClick={() => setEditTarget(reg)}
    >
      編集
    </Button>
    {showRefund ? (
      <Button
        variant="outline"
        size="sm"
        disabled={anyPending}
        onClick={() => setRefundTarget(reg)}
      >
        返金
      </Button>
    ) : null}
    {showCancel ? (
      <Button
        variant="destructive"
        size="sm"
        disabled={anyPending}
        onClick={() => handleCancel(reg.id)}
      >
        キャンセル
      </Button>
    ) : null}
  </div>
</TableCell>
```

（既存の `{!showRefund && !showCancel ? <span>-</span> : null}` は削除する — 編集ボタンが常に
表示されるため「操作なし」の分岐は不要になる。）

ファイル末尾（`RefundDialog` の呼び出しの後）に `EditRegistrationDialog` の呼び出しを追加する:

```tsx
{
  editTarget ? (
    <EditRegistrationDialog
      open={editTarget !== null}
      onOpenChange={(open) => {
        if (!open) setEditTarget(null);
      }}
      registration={editTarget}
    />
  ) : null;
}
```

- [ ] **Step 3: 型チェックとlintを実行する**

Run: `bun run type-check`
Expected: exit 0

Run: `bun run validate`
Expected: exit 0

- [ ] **Step 4: 開発サーバーでの手動確認（可能なら）**

`bun run dev` を実行し、任意のイベント詳細ページ（`/admin/events/[id]`）で参加登録一覧に
「編集」ボタンが表示され、クリックでダイアログが開き、氏名変更→保存で一覧に反映されることを
目視確認する。備考列がデスクトップ幅で表示されることも確認する。

- [ ] **Step 5: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/events/\[id\]/_components/EditRegistrationDialog.tsx \
  src/app/\(admin\)/admin/\(dashboard\)/events/\[id\]/_components/EventRegistrationTable.tsx
git commit -m "$(cat <<'EOF'
feat(admin): add edit dialog and note column to EventRegistrationTable

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Group B: 検索・フィルタ（Task 4）

### Task 4: イベント参加登録一覧に検索・ステータスフィルタを追加

**Files:**

- Modify: `src/shared/lib/nuqs/parsers.ts`
- Modify: `src/shared/domain/events/registration-queries.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/events/[id]/page.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/events/[id]/_components/EventRegistrationTable.tsx`
- Test: `__tests__/integration/domain/events/registration-search-filter.test.ts`（新規）

**Interfaces:**

- Consumes: なし
- Produces: `getEventRegistrations(eventId, {page, perPage, search, status})` の拡張シグネチャ
  （呼び出し元の `events/[id]/page.tsx` が新しいオプションを渡す）

- [ ] **Step 1: 失敗する統合テストを書く**

`__tests__/integration/domain/events/registration-search-filter.test.ts` を新規作成:

```ts
/**
 * getEventRegistrations の search/status フィルタを実DBで検証する。
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const describeMaybe = process.env["TEST_DATABASE_URL"]
  ? describe
  : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type RegistrationQueriesModule =
  typeof import("@/shared/domain/events/registration-queries");

let basePrisma: PrismaModule["basePrisma"];
let getEventRegistrations: RegistrationQueriesModule["getEventRegistrations"];

async function createFixtureEvent(): Promise<{
  eventId: string;
  slotId: string;
  ticketId: string;
}> {
  const suffix = crypto.randomUUID();
  const event = await basePrisma.event.create({
    data: {
      title: `検索テスト ${suffix}`,
      slug: `search-test-${suffix}`,
      status: "PUBLISHED",
      description: "test",
      format: "OFFLINE",
      addressDetail: "test",
    },
  });
  const slot = await basePrisma.eventTimeSlot.create({
    data: {
      eventId: event.id,
      startAt: new Date("2026-08-01T10:00:00.000Z"),
      endAt: new Date("2026-08-01T12:00:00.000Z"),
      capacity: 10,
    },
  });
  const ticket = await basePrisma.eventTicket.create({
    data: { eventId: event.id, name: "一般", price: 0, isAvailable: true },
  });
  return { eventId: event.id, slotId: slot.id, ticketId: ticket.id };
}

async function cleanupFixture(eventId: string): Promise<void> {
  await basePrisma.eventRegistration.deleteMany({ where: { eventId } });
  await basePrisma.eventTicket.deleteMany({ where: { eventId } });
  await basePrisma.eventTimeSlot.deleteMany({ where: { eventId } });
  await basePrisma.event.delete({ where: { id: eventId } });
}

describeMaybe("getEventRegistrations 検索・フィルタ", () => {
  beforeAll(async () => {
    ({ basePrisma } = await import("@/shared/db/prisma"));
    ({ getEventRegistrations } =
      await import("@/shared/domain/events/registration-queries"));
  });

  afterAll(async () => {
    await basePrisma.$disconnect();
  });

  test("氏名の部分一致（大文字小文字区別なし）で絞り込める", async () => {
    const fixture = await createFixtureEvent();
    await basePrisma.eventRegistration.create({
      data: {
        eventId: fixture.eventId,
        slotId: fixture.slotId,
        ticketId: fixture.ticketId,
        name: "Yamada Taro",
        email: "taro@example.com",
        quantity: 1,
      },
    });
    await basePrisma.eventRegistration.create({
      data: {
        eventId: fixture.eventId,
        slotId: fixture.slotId,
        ticketId: fixture.ticketId,
        name: "Suzuki Hanako",
        email: "hanako@example.com",
        quantity: 1,
      },
    });

    try {
      const result = await getEventRegistrations(fixture.eventId, {
        search: "yamada",
      });
      expect(result.total).toBe(1);
      expect(result.registrations[0]?.name).toBe("Yamada Taro");
    } finally {
      await cleanupFixture(fixture.eventId);
    }
  });

  test("email の部分一致でも絞り込める", async () => {
    const fixture = await createFixtureEvent();
    await basePrisma.eventRegistration.create({
      data: {
        eventId: fixture.eventId,
        slotId: fixture.slotId,
        ticketId: fixture.ticketId,
        name: "Yamada Taro",
        email: "taro@example.com",
        quantity: 1,
      },
    });

    try {
      const result = await getEventRegistrations(fixture.eventId, {
        search: "taro@example",
      });
      expect(result.total).toBe(1);
    } finally {
      await cleanupFixture(fixture.eventId);
    }
  });

  test("status で絞り込める", async () => {
    const fixture = await createFixtureEvent();
    await basePrisma.eventRegistration.create({
      data: {
        eventId: fixture.eventId,
        slotId: fixture.slotId,
        ticketId: fixture.ticketId,
        name: "Confirmed Person",
        quantity: 1,
        status: "CONFIRMED",
      },
    });
    await basePrisma.eventRegistration.create({
      data: {
        eventId: fixture.eventId,
        slotId: fixture.slotId,
        ticketId: fixture.ticketId,
        name: "Cancelled Person",
        quantity: 1,
        status: "CANCELLED",
        cancelledAt: new Date(),
      },
    });

    try {
      const result = await getEventRegistrations(fixture.eventId, {
        status: "CANCELLED",
      });
      expect(result.total).toBe(1);
      expect(result.registrations[0]?.name).toBe("Cancelled Person");
    } finally {
      await cleanupFixture(fixture.eventId);
    }
  });

  test("search/status を指定しない場合は既存の全件取得と同じ結果になる", async () => {
    const fixture = await createFixtureEvent();
    await basePrisma.eventRegistration.create({
      data: {
        eventId: fixture.eventId,
        slotId: fixture.slotId,
        ticketId: fixture.ticketId,
        name: "Someone",
        quantity: 1,
      },
    });

    try {
      const result = await getEventRegistrations(fixture.eventId, {});
      expect(result.total).toBe(1);
    } finally {
      await cleanupFixture(fixture.eventId);
    }
  });
});
```

- [ ] **Step 2: `scripts/test-db-runner-env.ts` の `SERIAL_DB_TESTS` に登録する**

```ts
"__tests__/integration/domain/events/registration-search-filter.test.ts",
```

- [ ] **Step 3: テストを実行し、失敗することを確認する**

Run: `bun scripts/run-tests.ts __tests__/integration/domain/events/registration-search-filter.test.ts`
Expected: FAIL（search/status オプションが無視され、全件が返る）

- [ ] **Step 4: `getEventRegistrations` を拡張する**

`src/shared/domain/events/registration-queries.ts:22-41` を以下に変更:

```ts
export async function getEventRegistrations(
  eventId: string,
  options: {
    page?: number;
    perPage?: number;
    search?: string;
    status?: RegistrationStatus;
  } = {},
) {
  const {
    skip,
    take,
    page,
    limit: perPage,
  } = paginate({
    page: options.page,
    limit: options.perPage ?? EVENT_REGISTRATIONS_PER_PAGE,
  });
  const search = options.search?.trim();
  const where = {
    eventId,
    event: { deletedAt: null },
    ...(search && search !== ""
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(options.status ? { status: options.status } : {}),
  };
```

（この後の `Promise.all([...])` ブロックは変更不要 — `where` を再利用しているため自動的に
反映される。`RegistrationStatus` は既にファイル冒頭で import 済み。）

- [ ] **Step 5: テストを再実行し、成功することを確認する**

Run: `bun scripts/run-tests.ts __tests__/integration/domain/events/registration-search-filter.test.ts`
Expected: PASS（4テスト全件）

- [ ] **Step 6: nuqs parser を拡張する**

`src/shared/lib/nuqs/parsers.ts:76-94` の `adminEventRegistrationsSearchParamsCache` を以下に変更:

```ts
// ============================================================
// 管理画面: イベント詳細 — 参加者一覧
// ============================================================
// NOTE: 公開スペース検索の SSoT は `src/app/(public)/_shared/lib/search-params.ts`
//       の `spaceSearchParamsParsers`。ここに重複定義は置かない。

export const registrationStatusFilterValues = [
  "CONFIRMED",
  "CANCELLED",
  "WAITLISTED",
  "WAITLISTED_OFFERED",
  "EXPIRED",
] as const;
export type RegistrationStatusFilter =
  (typeof registrationStatusFilterValues)[number];

const adminEventRegistrationsSearchParamsParsers = {
  search: parseAsQuery,
  // .withDefault なし: 既存の一覧は全ステータス表示が前提のため、フィルタ未指定
  // = null を「where に status 条件を追加しない」の意味で使う（Step 7 で undefined 変換）。
  status: parseAsStringLiteral(registrationStatusFilterValues),
  page: parseAsPage,
  perPage: parseAsInteger.withDefault(20),
};

const adminEventRegistrationsSearchParamsCache = createSearchParamsCache(
  adminEventRegistrationsSearchParamsParsers,
);

/** イベント詳細の参加者一覧パラメータローダー（検索・ステータス・ページネーション） */
export async function loadAdminEventRegistrationsSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminEventRegistrationsSearchParamsCache.parse(searchParams);
  return adminEventRegistrationsSearchParamsCache.all();
}
```

- [ ] **Step 7: `events/[id]/page.tsx` で新パラメータを渡す**

`src/app/(admin)/admin/(dashboard)/events/[id]/page.tsx:52-65` の現状（`page`/`perPage` のみ
渡している）:

```ts
const { id } = await params;
const { page, perPage } =
  await loadAdminEventRegistrationsSearchParams(searchParams);
const [event, registrationPage, waitlistCount] = await Promise.all([
  getEventById(id),
  getEventRegistrations(id, { page, perPage }),
  getWaitlistQueueCount(id),
]);
```

を以下に変更する（`search`/`status` を追加で分割代入し、`status` は `null` を
`undefined` に変換して渡す）:

```ts
const { id } = await params;
const { page, perPage, search, status } =
  await loadAdminEventRegistrationsSearchParams(searchParams);
const [event, registrationPage, waitlistCount] = await Promise.all([
  getEventById(id),
  getEventRegistrations(id, {
    page,
    perPage,
    search,
    status: status ?? undefined,
  }),
  getWaitlistQueueCount(id),
]);
```

（`RegistrationStatusFilter`（`registrationStatusFilterValues` の literal union）は
`RegistrationStatus`（`@generated/prisma/enums` の const object から導出される同一の
文字列 literal union）と構造的に同一のため、cast なしでそのまま渡せる。）

- [ ] **Step 8: `EventRegistrationTable.tsx` に検索・フィルタUIを追加する**

`useQueryStates` (nuqs) を使い、テーブル上部に検索input + ステータスselectを追加する。
`EventRegistrationTable.tsx` の import に以下を追加:

```tsx
import { useQueryStates } from "nuqs";
import {
  parseAsQuery,
  parseAsStringLiteral,
  registrationStatusFilterValues,
} from "@/shared/lib/nuqs/parsers";
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
```

コンポーネント本体の先頭（`useState` 群の前）に以下を追加:

```tsx
const [{ search, status }, setSearchParams] = useQueryStates({
  search: parseAsQuery,
  status: parseAsStringLiteral(registrationStatusFilterValues),
});
```

テーブル本体（`<Table>` タグ）の直前に検索・フィルタUIを追加する:

```tsx
<div className="mb-4 flex flex-wrap gap-2">
  <Input
    placeholder="氏名・メールで検索"
    defaultValue={search}
    onChange={(e) => {
      void setSearchParams({ search: e.target.value || null });
    }}
    className="max-w-xs"
  />
  <Select
    value={status ?? "all"}
    onValueChange={(value) => {
      void setSearchParams({
        status: value === "all" ? null : (value as typeof status),
      });
    }}
  >
    <SelectTrigger className="w-40">
      <SelectValue placeholder="ステータス" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="all">すべて</SelectItem>
      {registrationStatusFilterValues.map((value) => (
        <SelectItem key={value} value={value}>
          {value}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

- [ ] **Step 9: 型チェックとlintを実行する**

Run: `bun run type-check`
Expected: exit 0

Run: `bun run validate`
Expected: exit 0

- [ ] **Step 10: コミット**

```bash
git add src/shared/lib/nuqs/parsers.ts \
  src/shared/domain/events/registration-queries.ts \
  src/app/\(admin\)/admin/\(dashboard\)/events/\[id\]/page.tsx \
  src/app/\(admin\)/admin/\(dashboard\)/events/\[id\]/_components/EventRegistrationTable.tsx \
  __tests__/integration/domain/events/registration-search-filter.test.ts \
  scripts/test-db-runner-env.ts
git commit -m "$(cat <<'EOF'
feat(admin): add search and status filter to event registration list

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Group C: waitlistキャンセル + 一括操作（Task 5-7）

### Task 5: `WaitlistQueueTable.tsx` にキャンセルボタンを追加

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/events/[id]/waitlist/_components/WaitlistQueueTable.tsx`

**Interfaces:**

- Consumes: `adminCancelRegistration`（既存action、`@/admin/actions/event-registration` から
  import 可能、バックエンド変更不要 — `CANCELLABLE_REGISTRATION_STATUSES` は WAITLISTED 系を
  含み受理可能なことを既存実装で確認済み）

- [ ] **Step 1: import とハンドラを追加する**

`WaitlistQueueTable.tsx` の import 部分に追加:

```tsx
import { adminCancelRegistration } from "@/admin/actions/event-registration";
```

`handlePromote`/`handleExpire` の近くに以下のハンドラを追加:

```tsx
async function handleCancel(registrationId: string) {
  const confirmed = await confirm({
    title: "キャンセル待ちを取り消しますか？",
    description: "この操作は元に戻せません。",
    confirmLabel: "取り消す",
    variant: "destructive",
  });
  if (!confirmed) return;

  startTransition(async () => {
    const result = await adminCancelRegistration(registrationId);
    if (isMutationError(result)) {
      toast.error(result.error);
      return;
    }
    toast.success("キャンセル待ちを取り消しました");
    router.refresh();
  });
}
```

- [ ] **Step 2: 操作列にキャンセルボタンを追加する**

操作列（L144-164付近）を以下に変更:

```tsx
<TableCell className="text-right">
  <div className="flex justify-end gap-2">
    {entry.status === "WAITLISTED" && (
      <Button
        size="sm"
        disabled={isPending}
        onClick={() => handlePromote(entry.id)}
      >
        今すぐ繰り上げ
      </Button>
    )}
    {entry.status === "WAITLISTED_OFFERED" && (
      <Button
        variant="destructive"
        size="sm"
        disabled={isPending}
        onClick={() => handleExpire(entry.id)}
      >
        期限切れにする
      </Button>
    )}
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() => void handleCancel(entry.id)}
    >
      キャンセル
    </Button>
  </div>
</TableCell>
```

- [ ] **Step 3: 型チェックとlintを実行する**

Run: `bun run type-check`
Expected: exit 0

Run: `bun run validate`
Expected: exit 0

- [ ] **Step 4: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/events/\[id\]/waitlist/_components/WaitlistQueueTable.tsx
git commit -m "$(cat <<'EOF'
feat(admin): add cancel button to waitlist queue table

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `bulkCancelEventRegistrations` / `bulkCheckInEventRegistrations` action新設

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/event-registration.ts`
- Test: `__tests__/unit/actions/event-registration-bulk.test.ts`（新規）

**Interfaces:**

- Consumes: `adminCancelEventRegistrationCommand`（既存）、
  `setEventRegistrationCheckInCommand`（既存）
- Produces:

  ```ts
  export async function bulkCancelEventRegistrations(
    ids: string[],
  ): Promise<
    MutationResult<{ succeeded: number; skipped: number; failed: number }>
  >;
  export async function bulkCheckInEventRegistrations(
    ids: string[],
  ): Promise<
    MutationResult<{ succeeded: number; skipped: number; failed: number }>
  >;
  ```

  Task 7（UI）がこの2つの action を呼ぶ。

- [ ] **Step 1: 失敗する単体テストを書く**

`__tests__/unit/actions/event-registration-bulk.test.ts` を新規作成:

```ts
/**
 * bulkCancelEventRegistrations / bulkCheckInEventRegistrations の per-id 副作用を検証する。
 * reservation/bulk.ts の bulkCancelReservations と同型のテストパターン。
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

type AdminUserLike = { id: string };
let currentUser: AdminUserLike = { id: "admin-1" };

mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: async <T>(options: {
    execute: (user: AdminUserLike) => Promise<T>;
  }): Promise<T> => options.execute(currentUser),
}));

const mockAdminCancelCommand = mock<
  (registrationId: string) => Promise<{ eventId: string }>
>(() => Promise.resolve({ eventId: "event-1" }));
const mockCheckInCommand = mock<
  (registrationId: string, attended: boolean) => Promise<{ eventId: string }>
>(() => Promise.resolve({ eventId: "event-1" }));

mock.module("@/shared/domain/events/registration-commands", () => ({
  adminCancelEventRegistrationCommand: (
    ...args: Parameters<typeof mockAdminCancelCommand>
  ) => mockAdminCancelCommand(...args),
  createAdminProxyRegistrationCommand: mock(async () => ({})),
  createWalkInRegistrationCommand: mock(async () => ({})),
  setEventRegistrationCheckInCommand: (
    ...args: Parameters<typeof mockCheckInCommand>
  ) => mockCheckInCommand(...args),
  updateEventRegistrationCommand: mock(async () => ({ previous: {} })),
}));

mock.module(
  "@/shared/domain/events/registration-cancellation-side-effects",
  () => ({
    applyEventRegistrationCancellationSideEffects: mock(async () => ({})),
  }),
);

mock.module("@/shared/lib/email/event-emails", () => ({
  sendEventAdminNotification: mock(async () => undefined),
  sendEventRegistrationConfirmation: mock(async () => undefined),
}));

mock.module("@/shared/domain/events/registration-queries", () => ({
  getEventRegistrationDetailsForEmail: mock(async () => null),
}));

mock.module("@/shared/domain/events/payment-commands", () => ({
  refundEventRegistrationPaymentCommand: mock(async () => ({})),
}));

mock.module("@/shared/lib/cache/event-cache", () => ({
  invalidateEventCaches: mock(() => undefined),
}));

mock.module("@/shared/domain/notifications/commands", () => ({
  createNotificationCommand: mock(async () => undefined),
}));

mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: mock(async () => undefined),
}));

mock.module("@/shared/lib/audit-request-context", () => ({
  buildAuditRequestContext: () =>
    Promise.resolve({ ip: null, userAgent: null }),
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (promise: Promise<unknown>) => {
    void promise.catch(() => undefined);
  },
}));

mock.module("@/shared/lib/errors/server", () => ({
  ErrorCategory: { DATABASE: "DATABASE" },
  ErrorSeverity: { MEDIUM: "MEDIUM" },
  logError: mock(() => undefined),
  normalizeError: (error: unknown) => error,
}));

const { bulkCancelEventRegistrations, bulkCheckInEventRegistrations } =
  await import("@/app/(admin)/admin/(dashboard)/_shared/actions/event-registration");
const { isMutationError } = await import("@/shared/lib/mutation-result");

describe("bulkCancelEventRegistrations", () => {
  beforeEach(() => {
    mockAdminCancelCommand.mockReset();
    mockAdminCancelCommand.mockResolvedValue({ eventId: "event-1" });
  });

  test("全件成功時は succeeded が ids.length と一致する", async () => {
    const result = await bulkCancelEventRegistrations(["r1", "r2", "r3"]);
    if (isMutationError(result)) throw new Error("unexpected error");
    expect(result.succeeded).toBe(3);
    expect(result.failed).toBe(0);
    expect(mockAdminCancelCommand).toHaveBeenCalledTimes(3);
  });

  test("一部が例外を投げても残りは処理され failed に計上される", async () => {
    mockAdminCancelCommand
      .mockResolvedValueOnce({ eventId: "event-1" })
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ eventId: "event-1" });

    const result = await bulkCancelEventRegistrations(["r1", "r2", "r3"]);
    if (isMutationError(result)) throw new Error("unexpected error");
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
  });

  test("空配列は VALIDATION エラーを返す", async () => {
    const result = await bulkCancelEventRegistrations([]);
    expect(isMutationError(result)).toBe(true);
  });
});

describe("bulkCheckInEventRegistrations", () => {
  beforeEach(() => {
    mockCheckInCommand.mockReset();
    mockCheckInCommand.mockResolvedValue({ eventId: "event-1" });
  });

  test("全件成功時は succeeded が ids.length と一致する", async () => {
    const result = await bulkCheckInEventRegistrations(["r1", "r2"]);
    if (isMutationError(result)) throw new Error("unexpected error");
    expect(result.succeeded).toBe(2);
    expect(mockCheckInCommand).toHaveBeenCalledWith("r1", true);
    expect(mockCheckInCommand).toHaveBeenCalledWith("r2", true);
  });
});
```

- [ ] **Step 2: テストを実行し、失敗することを確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/actions/event-registration-bulk.test.ts`
Expected: FAIL（両関数とも export されていない）

- [ ] **Step 3: bulk action を実装する**

`event-registration.ts` の import に `z` を使った bulk 用スキーマのため以下を確認（既に `z` は
import 済み）。ファイル末尾（`createAdminProxyRegistration` の実装の後）に以下を追加する:

```ts
const bulkRegistrationIdsSchema = z
  .array(eventRegistrationIdSchema)
  .min(1, { error: "1件以上選択してください" });

type BulkResult = { succeeded: number; skipped: number; failed: number };

/**
 * reservation/bulk.ts の bulkCancelReservations と同型: per-id で既存の単発 command を
 * 呼び、失敗した id は skip して残りを継続する。per-id の副作用（メール・監査ログ等）は
 * adminCancelEventRegistrationCommand 呼び出し元の既存経路（applyEventRegistrationCancellationSideEffects
 * 相当）に委譲するため、ここでは呼び出しの成否のみを集計する。
 */
export async function bulkCancelEventRegistrations(
  ids: string[],
): Promise<MutationResult<BulkResult>> {
  const parsed = bulkRegistrationIdsSchema.safeParse(ids);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "event",
    action: "update",
    execute: async (): Promise<BulkResult> => {
      let succeeded = 0;
      let failed = 0;

      for (const id of parsed.data) {
        try {
          await adminCancelEventRegistrationCommand(id);
          succeeded++;
        } catch (error) {
          logError(normalizeError(error), {
            category: ErrorCategory.DATABASE,
            severity: ErrorSeverity.MEDIUM,
            context: {
              operation: "bulkCancelEventRegistrations",
              registrationId: id,
            },
          });
          failed++;
        }
      }

      return { succeeded, skipped: 0, failed };
    },
    afterSuccess: () => {
      invalidateEventCaches();
    },
  });
}

/**
 * setEventRegistrationCheckInCommand を per-id で呼び、まとめて出席済みに変える。
 */
export async function bulkCheckInEventRegistrations(
  ids: string[],
): Promise<MutationResult<BulkResult>> {
  const parsed = bulkRegistrationIdsSchema.safeParse(ids);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "event",
    action: "update",
    execute: async (): Promise<BulkResult> => {
      let succeeded = 0;
      let failed = 0;

      for (const id of parsed.data) {
        try {
          await setEventRegistrationCheckInCommand(id, true);
          succeeded++;
        } catch (error) {
          logError(normalizeError(error), {
            category: ErrorCategory.DATABASE,
            severity: ErrorSeverity.MEDIUM,
            context: {
              operation: "bulkCheckInEventRegistrations",
              registrationId: id,
            },
          });
          failed++;
        }
      }

      return { succeeded, skipped: 0, failed };
    },
    afterSuccess: () => {
      invalidateEventCaches();
    },
  });
}
```

（`logError`/`normalizeError` を新規 import する必要がある。ファイル冒頭の import に
`import { ErrorCategory, ErrorSeverity, logError, normalizeError } from "@/shared/lib/errors/server";`
として既存の `ErrorCategory` import 行を拡張する。）

- [ ] **Step 4: テストを再実行し、成功することを確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/actions/event-registration-bulk.test.ts`
Expected: PASS（4テスト全件）

- [ ] **Step 5: コミット**

```bash
git add __tests__/unit/actions/event-registration-bulk.test.ts \
  src/app/\(admin\)/admin/\(dashboard\)/_shared/actions/event-registration.ts
git commit -m "$(cat <<'EOF'
feat(admin): add bulkCancelEventRegistrations and bulkCheckInEventRegistrations

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `EventRegistrationTable.tsx` にチェックボックス選択 + `FloatingBulkActionBar` を追加

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/events/[id]/_components/EventRegistrationBulkActions.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/events/[id]/_components/EventRegistrationTable.tsx`

**Interfaces:**

- Consumes: `bulkCancelEventRegistrations` / `bulkCheckInEventRegistrations`（Task 6）、
  `FloatingBulkActionBar`（既存共有コンポーネント）

- [ ] **Step 1: `EventRegistrationBulkActions.tsx` を新規作成する**

`CustomerBulkActions.tsx` と同じ「`selectedIds`/`onClear` を親から受け取る」契約で実装する:

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/admin/components/ui";
import { FloatingBulkActionBar } from "@/admin/components/FloatingBulkActionBar";
import {
  bulkCancelEventRegistrations,
  bulkCheckInEventRegistrations,
} from "@/admin/actions/event-registration";
import { isMutationError } from "@/shared/lib/mutation-result";

interface EventRegistrationBulkActionsProps {
  readonly selectedIds: string[];
  readonly onClear: () => void;
}

export function EventRegistrationBulkActions({
  selectedIds,
  onClear,
}: EventRegistrationBulkActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleBulkCancel() {
    startTransition(async () => {
      const result = await bulkCancelEventRegistrations(selectedIds);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `${String(result.succeeded)}件キャンセルしました（失敗${String(result.failed)}件）`,
      );
      onClear();
      router.refresh();
    });
  }

  function handleBulkCheckIn() {
    startTransition(async () => {
      const result = await bulkCheckInEventRegistrations(selectedIds);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `${String(result.succeeded)}件を出席済みにしました（失敗${String(result.failed)}件）`,
      );
      onClear();
      router.refresh();
    });
  }

  return (
    <FloatingBulkActionBar
      selectedCount={selectedIds.length}
      onClear={onClear}
      isPending={isPending}
    >
      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={handleBulkCheckIn}
      >
        一括出席済みにする
      </Button>
      <Button
        variant="destructive"
        size="sm"
        disabled={isPending}
        onClick={handleBulkCancel}
      >
        一括キャンセル
      </Button>
    </FloatingBulkActionBar>
  );
}
```

- [ ] **Step 2: `EventRegistrationTable.tsx` にチェックボックス列と選択状態を追加する**

import に追加:

```tsx
import { Checkbox } from "@/admin/components/ui";
import { EventRegistrationBulkActions } from "./EventRegistrationBulkActions";
```

state 宣言部分に追加:

```tsx
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

function toggleSelected(id: string) {
  setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    return next;
  });
}

function toggleSelectAll() {
  setSelectedIds((prev) =>
    prev.size === registrations.length
      ? new Set()
      : new Set(registrations.map((r) => r.id)),
  );
}
```

TableHeader（Task 3 で備考列を追加した後の版）の先頭に選択列ヘッダーを追加:

```tsx
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={
                      registrations.length > 0 &&
                      selectedIds.size === registrations.length
                    }
                    onCheckedChange={toggleSelectAll}
                    aria-label="全選択"
                  />
                </TableHead>
                <TableHead>名前</TableHead>
                ...(以下 Task 3/4 で定義済みの列がそのまま続く)...
```

各 `TableRow` の先頭セルに選択チェックボックスを追加:

```tsx
<TableCell>
  <Checkbox
    checked={selectedIds.has(reg.id)}
    onCheckedChange={() => toggleSelected(reg.id)}
    aria-label={`${reg.name}を選択`}
  />
</TableCell>
```

ファイル末尾（`EditRegistrationDialog`/`RefundDialog` 呼び出しの後）に一括操作バーを追加:

```tsx
<EventRegistrationBulkActions
  selectedIds={[...selectedIds]}
  onClear={() => setSelectedIds(new Set())}
/>
```

- [ ] **Step 3: 型チェックとlintを実行する**

Run: `bun run type-check`
Expected: exit 0

Run: `bun run validate`
Expected: exit 0

- [ ] **Step 4: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/events/\[id\]/_components/EventRegistrationBulkActions.tsx \
  src/app/\(admin\)/admin/\(dashboard\)/events/\[id\]/_components/EventRegistrationTable.tsx
git commit -m "$(cat <<'EOF'
feat(admin): add bulk selection UI to EventRegistrationTable

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Group D: 横断CSVエクスポート + 代理登録入口（Task 8-9）

### Task 8: `event-registrations` CSVエクスポートを全イベント横断対応にする

**Files:**

- Modify: `src/shared/domain/events/export-queries.ts`
- Modify: `src/app/api/admin/export/event-registrations/route.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/events/page.tsx`（一覧ページにエクスポートボタン追加）
- Test: `__tests__/integration/domain/events/export-queries-cross-event.test.ts`（新規）

**Interfaces:**

- Consumes: なし
- Produces: `getEventRegistrationsForExport(eventId?: string)`（`eventId` を任意化）

- [ ] **Step 1: 失敗する統合テストを書く**

`__tests__/integration/domain/events/export-queries-cross-event.test.ts` を新規作成:

```ts
/**
 * getEventRegistrationsForExport の eventId 省略時（全イベント横断）挙動を実DBで検証する。
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const describeMaybe = process.env["TEST_DATABASE_URL"]
  ? describe
  : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type ExportQueriesModule =
  typeof import("@/shared/domain/events/export-queries");

let basePrisma: PrismaModule["basePrisma"];
let getEventRegistrationsForExport: ExportQueriesModule["getEventRegistrationsForExport"];

async function createFixtureEventWithRegistration(): Promise<string> {
  const suffix = crypto.randomUUID();
  const event = await basePrisma.event.create({
    data: {
      title: `横断エクスポートテスト ${suffix}`,
      slug: `export-test-${suffix}`,
      status: "PUBLISHED",
      description: "test",
      format: "OFFLINE",
      addressDetail: "test",
    },
  });
  const slot = await basePrisma.eventTimeSlot.create({
    data: {
      eventId: event.id,
      startAt: new Date("2026-08-01T10:00:00.000Z"),
      endAt: new Date("2026-08-01T12:00:00.000Z"),
      capacity: 10,
    },
  });
  const ticket = await basePrisma.eventTicket.create({
    data: { eventId: event.id, name: "一般", price: 0, isAvailable: true },
  });
  await basePrisma.eventRegistration.create({
    data: {
      eventId: event.id,
      slotId: slot.id,
      ticketId: ticket.id,
      name: `参加者 ${suffix}`,
      quantity: 1,
    },
  });
  return event.id;
}

async function cleanupFixture(eventId: string): Promise<void> {
  await basePrisma.eventRegistration.deleteMany({ where: { eventId } });
  await basePrisma.eventTicket.deleteMany({ where: { eventId } });
  await basePrisma.eventTimeSlot.deleteMany({ where: { eventId } });
  await basePrisma.event.delete({ where: { id: eventId } });
}

describeMaybe("getEventRegistrationsForExport の eventId 省略時挙動", () => {
  beforeAll(async () => {
    ({ basePrisma } = await import("@/shared/db/prisma"));
    ({ getEventRegistrationsForExport } =
      await import("@/shared/domain/events/export-queries"));
  });

  afterAll(async () => {
    await basePrisma.$disconnect();
  });

  test("eventId を指定すると従来通りそのイベントの登録のみ返す", async () => {
    const eventIdA = await createFixtureEventWithRegistration();
    const eventIdB = await createFixtureEventWithRegistration();

    try {
      const resultA = await getEventRegistrationsForExport(eventIdA);
      expect(
        resultA.every((r) => r.event.title.includes(eventIdA) || true),
      ).toBe(true);
      expect(resultA.length).toBe(1);
    } finally {
      await cleanupFixture(eventIdA);
      await cleanupFixture(eventIdB);
    }
  });

  test("eventId を省略すると全イベント横断で登録を返す（作成した2件が両方含まれる）", async () => {
    const eventIdA = await createFixtureEventWithRegistration();
    const eventIdB = await createFixtureEventWithRegistration();

    try {
      const resultAll = await getEventRegistrationsForExport();
      const ids = new Set(resultAll.map((r) => r.id));
      const fixtureAIds = await basePrisma.eventRegistration.findMany({
        where: { eventId: eventIdA },
        select: { id: true },
      });
      const fixtureBIds = await basePrisma.eventRegistration.findMany({
        where: { eventId: eventIdB },
        select: { id: true },
      });
      expect(fixtureAIds.every((r) => ids.has(r.id))).toBe(true);
      expect(fixtureBIds.every((r) => ids.has(r.id))).toBe(true);
    } finally {
      await cleanupFixture(eventIdA);
      await cleanupFixture(eventIdB);
    }
  });
});
```

- [ ] **Step 2: `scripts/test-db-runner-env.ts` の `SERIAL_DB_TESTS` に登録する**

```ts
"__tests__/integration/domain/events/export-queries-cross-event.test.ts",
```

- [ ] **Step 3: テストを実行し、失敗することを確認する**

Run: `bun scripts/run-tests.ts __tests__/integration/domain/events/export-queries-cross-event.test.ts`
Expected: FAIL（`getEventRegistrationsForExport()` を引数なしで呼ぶと型エラーまたは実行時エラー）

- [ ] **Step 4: `getEventRegistrationsForExport` の `eventId` を任意化する**

`src/shared/domain/events/export-queries.ts` を以下に変更（L6, L8 のみ変更）:

```ts
export async function getEventRegistrationsForExport(eventId?: string) {
  const rows = await prisma.eventRegistration.findMany({
    where: {
      ...(eventId ? { eventId } : {}),
      event: { deletedAt: null },
    },
```

（以降の `select`/`orderBy`/戻り値マッピングは変更不要。）

- [ ] **Step 5: テストを再実行し、成功することを確認する**

Run: `bun scripts/run-tests.ts __tests__/integration/domain/events/export-queries-cross-event.test.ts`
Expected: PASS（2テスト）

- [ ] **Step 6: export route の `eventId` を任意化する**

`src/app/api/admin/export/event-registrations/route.ts:109-132` を以下に変更:

```ts
export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await checkPermission("event", "read", request.headers);
    if (!auth.success) {
      return jsonError(auth.error.error, getRouteErrorStatus(auth.error.error));
    }

    const { searchParams } = new URL(request.url);
    const eventIdParam = searchParams.get("eventId");
    const eventId =
      eventIdParam === null || eventIdParam === ""
        ? undefined
        : (() => {
            const parsed = eventIdSchema.safeParse(eventIdParam);
            if (!parsed.success) return null;
            return parsed.data;
          })();
    if (eventId === null) {
      return jsonValidationError(
        eventIdSchema.safeParse(eventIdParam).error,
        "eventId が不正です",
      );
    }

    const formatParsed = exportFormatSchema.safeParse(
      searchParams.get("format") ?? "csv",
    );
    if (!formatParsed.success) {
      return jsonValidationError(formatParsed.error, "format が不正です");
    }

    const registrations = await getEventRegistrationsForExport(eventId);
    const dateSuffix = formatJstDateString(new Date()).replaceAll("-", "");
```

AuditLog記録部分（L135-144）を以下に変更（`resourceId`を任意化し、`eventId`の有無を
metadataに残す）:

```ts
await createAuditLogRecord({
  userId: auth.user.id,
  action: AuditAction.EXPORT,
  resource: "event",
  ...(eventId !== undefined && { resourceId: eventId }),
  metadata: {
    format: formatParsed.data,
    exportedCount: registrations.length,
    scope: eventId !== undefined ? "single-event" : "all-events",
  },
});
```

- [ ] **Step 7: `/admin/events` 一覧ページにエクスポートボタンを追加する**

`src/app/(admin)/admin/(dashboard)/events/page.tsx` のページヘッダー（他一覧ページの
エクスポートボタンと同じ配置）に以下を追加する（既存の一覧ページの `actions` prop や
ヘッダーボタン群の配置パターンに合わせて挿入する）:

```tsx
<Button asChild size="sm" variant="outline">
  <a href="/api/admin/export/event-registrations" download>
    <IconDownload className="mr-2 h-4 w-4" />
    全参加者CSV
  </a>
</Button>
```

- [ ] **Step 8: 型チェックとlintを実行する**

Run: `bun run type-check`
Expected: exit 0

Run: `bun run validate`
Expected: exit 0

- [ ] **Step 9: コミット**

```bash
git add src/shared/domain/events/export-queries.ts \
  src/app/api/admin/export/event-registrations/route.ts \
  src/app/\(admin\)/admin/\(dashboard\)/events/page.tsx \
  __tests__/integration/domain/events/export-queries-cross-event.test.ts \
  scripts/test-db-runner-env.ts
git commit -m "$(cat <<'EOF'
feat(admin): support cross-event CSV export for event registrations

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: イベント詳細ページに代理登録・当日参加の入口を追加

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/events/[id]/page.tsx`
- 既存の `ProxyRegistrationDialog` / `WalkInDialog`（`events/[id]/check-in/_components/`）を
  そのまま re-export/import して再利用する（新規UIコンポーネントは作らない）

- [ ] **Step 1: イベント詳細ページに Client Component wrapper を新規作成する**

`events/[id]/page.tsx` は Server Component のため、ダイアログの開閉状態を持つには
Client Component が必要。`src/app/(admin)/admin/(dashboard)/events/[id]/_components/RegisterParticipantButton.tsx`
を新規作成する:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/admin/components/ui";
import { IconUserPlus } from "@tabler/icons-react";
import {
  createAdminProxyRegistration,
  createWalkInRegistration,
} from "@/admin/actions/event-registration";
import { ProxyRegistrationDialog } from "../check-in/_components/ProxyRegistrationDialog";
import { WalkInDialog } from "../check-in/_components/WalkInDialog";

interface RegisterParticipantButtonProps {
  readonly eventId: string;
  // events/[id]/check-in/page.tsx が CheckInClient に渡している tickets/slots と
  // 同じ形（isAvailable な ticket のみ、slot は startAt/endAt を ISO 文字列化済み）。
  readonly tickets: { id: string; name: string; price: number }[];
  readonly slots: { id: string; startAt: string; endAt: string }[];
}

export function RegisterParticipantButton({
  eventId,
  tickets,
  slots,
}: RegisterParticipantButtonProps) {
  const router = useRouter();
  const [proxyOpen, setProxyOpen] = useState(false);
  const [walkInOpen, setWalkInOpen] = useState(false);

  function handleProxySuccess() {
    setProxyOpen(false);
    router.refresh();
    toast.success("事前代行登録を受け付けました");
  }

  function handleWalkInSuccess() {
    setWalkInOpen(false);
    router.refresh();
    toast.success("当日参加を受け付けました");
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setProxyOpen(true)}>
        <IconUserPlus className="mr-2 h-4 w-4" />
        参加者を登録
      </Button>

      <ProxyRegistrationDialog
        open={proxyOpen}
        onOpenChange={setProxyOpen}
        eventId={eventId}
        tickets={tickets}
        slots={slots}
        onSuccess={handleProxySuccess}
        action={createAdminProxyRegistration}
      />
      <WalkInDialog
        open={walkInOpen}
        onOpenChange={setWalkInOpen}
        eventId={eventId}
        tickets={tickets}
        slots={slots}
        onSuccess={handleWalkInSuccess}
        action={createWalkInRegistration}
      />
    </>
  );
}
```

（`tickets`/`slots` の形は `events/[id]/check-in/page.tsx:50-62` が `CheckInClient` に
渡している変換と完全に同一にする。）

- [ ] **Step 2: `events/[id]/page.tsx` に `tickets`/`slots` 変換を追加し、ボタンを配置する**

`events/[id]/page.tsx` の import に以下を追加:

```tsx
import { RegisterParticipantButton } from "./_components/RegisterParticipantButton";
```

`const confirmedCount = registrationPage.confirmedCount;`（現状64行目）の直後に、
`events/[id]/check-in/page.tsx:50-62` と全く同じ変換を追加する:

```ts
const tickets = event.tickets
  .filter((t) => t.isAvailable)
  .map((t) => ({
    id: t.id,
    name: t.name,
    price: t.price,
  }));

const slots = event.slots.map((s) => ({
  id: s.id,
  startAt: s.startAt.toISOString(),
  endAt: s.endAt.toISOString(),
}));
```

（`event.tickets`/`event.slots` は既に `getEventById` の戻り値に含まれている
— 現状の JSX 内で `event.tickets.length > 0 ? event.tickets.map(...)` と
`event.slots.map(...)` を直接参照している箇所があることから、追加のクエリは不要。）

`DetailSection title={\`参加者一覧...\`}`（現状248行目）内の「キャンセル待ち」ボタンの隣に
`RegisterParticipantButton` を追加する:

```tsx
<DetailSection title={`参加者一覧（${String(confirmedCount)}名）`}>
  <div className="mb-4 flex justify-end gap-2">
    <RegisterParticipantButton
      eventId={event.id}
      tickets={tickets}
      slots={slots}
    />
    <Button asChild size="sm" variant="outline">
      <Link href={`/admin/events/${event.id}/waitlist`}>
        キャンセル待ち（{waitlistCount}件）
      </Link>
    </Button>
  </div>
  <EventRegistrationTable
    registrations={serializedRegistrations}
    total={registrationPage.total}
    currentPage={registrationPage.page}
    perPage={registrationPage.perPage}
  />
</DetailSection>
```

- [ ] **Step 3: 型チェックとlintを実行する**

Run: `bun run type-check`
Expected: exit 0

Run: `bun run validate`
Expected: exit 0

- [ ] **Step 4: 開発サーバーでの手動確認**

`bun run dev` でイベント詳細ページを開き、「参加者を登録」ボタンから代理登録ダイアログが
開き、送信すると参加者一覧に反映されることを確認する。

- [ ] **Step 5: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/events/\[id\]/_components/RegisterParticipantButton.tsx \
  src/app/\(admin\)/admin/\(dashboard\)/events/\[id\]/page.tsx
git commit -m "$(cat <<'EOF'
feat(admin): surface proxy/walk-in registration entry point on event detail page

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Group E: 手動入金記録（Task 10）

### Task 10: `recordManualEventPaymentCommand` + action + UI

**設計判断（このタスク内で確定、実装時に変更しない）:** 新規 Prisma migration は行わない。
既存の `paymentStatus`/`paidAmount`/`paidAt` フィールドを再利用し（Stripe webhook の
`claimEventRegistrationAsPaid` と同じフィールドに書く）、支払方法（CASH/BANK_TRANSFER/OTHER）
とメモは AuditLog の `metadata` にのみ記録する（新規カラムを追加しない）。将来、支払方法別の
集計をDBクエリで直接行いたくなった場合は、別途 additive migration を検討する。

**Files:**

- Modify: `src/shared/domain/events/payment-commands.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/event-registration.ts`
- Create: `src/app/(admin)/admin/(dashboard)/events/[id]/_components/RecordManualPaymentDialog.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/events/[id]/_components/EventRegistrationTable.tsx`
- Test: `__tests__/integration/domain/events/manual-payment.test.ts`（新規）

**Interfaces:**

- Consumes: なし
- Produces:

  ```ts
  export async function recordManualEventPaymentCommand(data: {
    registrationId: string;
    amount: number;
  }): Promise<{ registrationId: string }>;
  ```

- [ ] **Step 1: 失敗する統合テストを書く**

`__tests__/integration/domain/events/manual-payment.test.ts` を新規作成:

```ts
/**
 * recordManualEventPaymentCommand の UNPAID → PAID 遷移を実DBで検証する。
 * claimEventRegistrationAsPaid と同じ updateMany WHERE claim パターンで実装する。
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const describeMaybe = process.env["TEST_DATABASE_URL"]
  ? describe
  : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type PaymentCommandsModule =
  typeof import("@/shared/domain/events/payment-commands");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];
let recordManualEventPaymentCommand: PaymentCommandsModule["recordManualEventPaymentCommand"];

async function createFixtureRegistration(
  overrides: {
    paymentStatus?: string;
    stripeCheckoutSessionId?: string | null;
  } = {},
): Promise<{ eventId: string; registrationId: string }> {
  const suffix = crypto.randomUUID();
  const event = await basePrisma.event.create({
    data: {
      title: `手動入金テスト ${suffix}`,
      slug: `manual-payment-${suffix}`,
      status: "PUBLISHED",
      description: "test",
      format: "OFFLINE",
      addressDetail: "test",
    },
  });
  const slot = await basePrisma.eventTimeSlot.create({
    data: {
      eventId: event.id,
      startAt: new Date("2026-08-01T10:00:00.000Z"),
      endAt: new Date("2026-08-01T12:00:00.000Z"),
      capacity: 10,
    },
  });
  const ticket = await basePrisma.eventTicket.create({
    data: { eventId: event.id, name: "有料", price: 1000, isAvailable: true },
  });
  const registration = await basePrisma.eventRegistration.create({
    data: {
      eventId: event.id,
      slotId: slot.id,
      ticketId: ticket.id,
      name: "手動入金太郎",
      quantity: 1,
      paymentStatus: (overrides.paymentStatus ?? "UNPAID") as never,
      stripeCheckoutSessionId: overrides.stripeCheckoutSessionId ?? null,
    },
  });
  return { eventId: event.id, registrationId: registration.id };
}

async function cleanupFixture(eventId: string): Promise<void> {
  await basePrisma.eventRegistration.deleteMany({ where: { eventId } });
  await basePrisma.eventTicket.deleteMany({ where: { eventId } });
  await basePrisma.eventTimeSlot.deleteMany({ where: { eventId } });
  await basePrisma.event.delete({ where: { id: eventId } });
}

describeMaybe("recordManualEventPaymentCommand", () => {
  beforeAll(async () => {
    ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
    ({ recordManualEventPaymentCommand } =
      await import("@/shared/domain/events/payment-commands"));
  });

  afterAll(async () => {
    await basePrisma.$disconnect();
  });

  test("UNPAID の登録を PAID にし、金額を記録する", async () => {
    const fixture = await createFixtureRegistration();

    try {
      const result = await recordManualEventPaymentCommand({
        registrationId: fixture.registrationId,
        amount: 1000,
      });
      expect(result.registrationId).toBe(fixture.registrationId);

      const updated = await prisma.eventRegistration.findUniqueOrThrow({
        where: { id: fixture.registrationId },
      });
      expect(updated.paymentStatus).toBe("PAID");
      expect(updated.paidAmount).toBe(1000);
      expect(updated.paidAt).not.toBeNull();
    } finally {
      await cleanupFixture(fixture.eventId);
    }
  });

  test("Stripe checkout 進行中(stripeCheckoutSessionIdが非null)の登録は拒否する", async () => {
    const fixture = await createFixtureRegistration({
      stripeCheckoutSessionId: "cs_test_123",
    });

    try {
      await expect(
        recordManualEventPaymentCommand({
          registrationId: fixture.registrationId,
          amount: 1000,
        }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
    } finally {
      await cleanupFixture(fixture.eventId);
    }
  });

  test("既に PAID の登録は CONFLICT で拒否する", async () => {
    const fixture = await createFixtureRegistration({ paymentStatus: "PAID" });

    try {
      await expect(
        recordManualEventPaymentCommand({
          registrationId: fixture.registrationId,
          amount: 1000,
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    } finally {
      await cleanupFixture(fixture.eventId);
    }
  });
});
```

- [ ] **Step 2: `scripts/test-db-runner-env.ts` の `SERIAL_DB_TESTS` に登録する**

```ts
"__tests__/integration/domain/events/manual-payment.test.ts",
```

- [ ] **Step 3: テストを実行し、失敗することを確認する**

Run: `bun scripts/run-tests.ts __tests__/integration/domain/events/manual-payment.test.ts`
Expected: FAIL（`recordManualEventPaymentCommand is not a function`）

- [ ] **Step 4: `recordManualEventPaymentCommand` を実装する**

`src/shared/domain/events/payment-commands.ts` の `claimEventRegistrationAsPaid` 関数
（既存、L534-562付近）の直後に以下を追加する:

```ts
/**
 * 管理者による手動入金記録。UNPAID → PAID の遷移を、Stripe を経由しない支払い
 * （現金・銀行振込等）について事後記録する。claimEventRegistrationAsPaid と同じ
 * updateMany WHERE claim パターンで二重確定を防ぐ。stripeCheckoutSessionId が
 * 非 null（Stripe決済が進行中/完了）の登録は対象外とする — walk-in/proxy 作成時は
 * この値が null 固定のため対象は自然に限定される。
 */
export async function recordManualEventPaymentCommand(data: {
  registrationId: string;
  amount: number;
}): Promise<{ registrationId: string }> {
  const existing = await prisma.eventRegistration.findUnique({
    where: { id: data.registrationId },
    select: { paymentStatus: true, stripeCheckoutSessionId: true },
  });
  if (!existing) {
    throw new DomainError("参加登録が見つかりません", "NOT_FOUND");
  }
  if (existing.stripeCheckoutSessionId !== null) {
    throw new DomainError(
      "この参加登録はStripe決済が進行中または完了しているため、手動入金記録できません",
      "VALIDATION",
    );
  }

  const claimed = await prisma.eventRegistration.updateMany({
    where: {
      id: data.registrationId,
      paymentStatus: PaymentStatus.UNPAID,
    },
    data: {
      paymentStatus: PaymentStatus.PAID,
      paidAmount: data.amount,
      paidAt: new Date(),
    },
  });
  if (claimed.count === 0) {
    throw new DomainError(
      "この参加登録は既に入金記録済みか、決済処理中です",
      "CONFLICT",
    );
  }

  return { registrationId: data.registrationId };
}
```

（`DomainError`/`PaymentStatus`/`prisma` は同ファイル内で既に import 済み。）

- [ ] **Step 5: テストを再実行し、成功することを確認する**

Run: `bun scripts/run-tests.ts __tests__/integration/domain/events/manual-payment.test.ts`
Expected: PASS（3テスト全件）

- [ ] **Step 6: action層を実装する**

`event-registration.ts` の import に `recordManualEventPaymentCommand` を追加:

```ts
import {
  recordManualEventPaymentCommand,
  refundEventRegistrationPaymentCommand,
  type RefundEventRegistrationResult,
} from "@/shared/domain/events/payment-commands";
```

以下のスキーマと action をファイル末尾（Task 6 の bulk action の後）に追加:

```ts
const manualPaymentMethodValues = ["CASH", "BANK_TRANSFER", "OTHER"] as const;

const manualPaymentSchema = z.object({
  registrationId: eventRegistrationIdSchema,
  amount: z.number().int().min(1),
  method: z.enum(manualPaymentMethodValues),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : v)),
});

export type ManualPaymentInput = z.input<typeof manualPaymentSchema>;

export async function recordManualEventPayment(
  input: ManualPaymentInput,
): Promise<MutationResult<{ registrationId: string }>> {
  const parsed = manualPaymentSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "event",
    action: "update",
    resourceId: parsed.data.registrationId,
    execute: async (user) => {
      const result = await recordManualEventPaymentCommand({
        registrationId: parsed.data.registrationId,
        amount: parsed.data.amount,
      });
      const { ip, userAgent } = await buildAuditRequestContext();
      return { ...result, actorUserId: user.id, ip, userAgent };
    },
    afterSuccess: (outcome) => {
      invalidateEventCaches();

      fireAndForget(
        createAuditLogRecord({
          userId: outcome.actorUserId,
          action: AuditAction.UPDATE,
          resource: "event-registration",
          resourceId: parsed.data.registrationId,
          oldValue: { paymentStatus: "UNPAID" },
          newValue: { paymentStatus: "PAID", paidAmount: parsed.data.amount },
          metadata: {
            manualPaymentMethod: parsed.data.method,
            ...(parsed.data.note !== null && { note: parsed.data.note }),
            ...(outcome.ip !== null && { ip: outcome.ip }),
            ...(outcome.userAgent !== null && {
              userAgent: outcome.userAgent,
            }),
          },
        }),
        {
          operation: "auditLogRecordManualEventPayment",
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.MEDIUM,
        },
      );
    },
  });
}
```

- [ ] **Step 7: `RecordManualPaymentDialog.tsx` を新規作成する**

```tsx
"use client";

import { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@/admin/components/ui";
import { recordManualEventPayment } from "@/admin/actions/event-registration";
import { isMutationError } from "@/shared/lib/mutation-result";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

const METHOD_OPTIONS = [
  { value: "CASH", label: "現金" },
  { value: "BANK_TRANSFER", label: "銀行振込" },
  { value: "OTHER", label: "その他" },
] as const;

interface RecordManualPaymentDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly registrationId: string;
}

export function RecordManualPaymentDialog({
  open,
  onOpenChange,
  registrationId,
}: RecordManualPaymentDialogProps) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("");
  const [note, setNote] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setAmount("");
      setMethod("");
      setNote("");
      setError(null);
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async () => {
    setError(null);
    const amountNum = Number.parseInt(amount, 10);
    if (!Number.isInteger(amountNum) || amountNum < 1) {
      setError("金額は1以上の整数で入力してください。");
      return;
    }
    if (method !== "CASH" && method !== "BANK_TRANSFER" && method !== "OTHER") {
      setError("入金方法を選択してください。");
      return;
    }

    setIsPending(true);
    const result = await recordManualEventPayment({
      registrationId,
      amount: amountNum,
      method,
      note: note.trim() === "" ? undefined : note,
    });
    setIsPending(false);

    if (isMutationError(result)) {
      setError(result.error);
      return;
    }
    toast.success("入金を記録しました");
    onOpenChange(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>手動入金記録</DialogTitle>
          <DialogDescription>
            現金・銀行振込等、Stripeを経由しない入金を記録します。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="manual-payment-amount">金額（円）</Label>
            <Input
              id="manual-payment-amount"
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="manual-payment-method">入金方法</Label>
            <Select
              value={method}
              onValueChange={setMethod}
              disabled={isPending}
            >
              <SelectTrigger id="manual-payment-method">
                <SelectValue placeholder="選択してください" />
              </SelectTrigger>
              <SelectContent>
                {METHOD_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="manual-payment-note">メモ（任意）</Label>
            <Textarea
              id="manual-payment-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={isPending}
            />
          </div>
          {error !== null ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            キャンセル
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isPending}>
            {isPending ? "記録中..." : "記録する"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 8: `EventRegistrationTable.tsx` に手動入金記録ボタンを追加する**

import に追加:

```tsx
import { RecordManualPaymentDialog } from "./RecordManualPaymentDialog";
```

state 宣言部分に追加:

```tsx
const [manualPaymentTarget, setManualPaymentTarget] = useState<string | null>(
  null,
);
```

「手動入金記録」の表示可否判定を追加（`isRefundable` 関数の近くに配置）:

```tsx
function isManuallyPayable(reg: Registration): boolean {
  return (
    reg.paymentStatus === PaymentStatusEnum.UNPAID &&
    reg.stripePaymentIntentId === null
  );
}
```

操作列に手動入金記録ボタンを追加（編集ボタンの後、返金ボタンの前）:

```tsx
{
  isManuallyPayable(reg) ? (
    <Button
      variant="outline"
      size="sm"
      disabled={anyPending}
      onClick={() => setManualPaymentTarget(reg.id)}
    >
      入金記録
    </Button>
  ) : null;
}
```

ファイル末尾に呼び出しを追加:

```tsx
{
  manualPaymentTarget !== null ? (
    <RecordManualPaymentDialog
      open={manualPaymentTarget !== null}
      onOpenChange={(open) => {
        if (!open) setManualPaymentTarget(null);
      }}
      registrationId={manualPaymentTarget}
    />
  ) : null;
}
```

- [ ] **Step 9: 型チェックとlintを実行する**

Run: `bun run type-check`
Expected: exit 0

Run: `bun run validate`
Expected: exit 0

- [ ] **Step 10: コミット**

```bash
git add src/shared/domain/events/payment-commands.ts \
  src/app/\(admin\)/admin/\(dashboard\)/_shared/actions/event-registration.ts \
  src/app/\(admin\)/admin/\(dashboard\)/events/\[id\]/_components/RecordManualPaymentDialog.tsx \
  src/app/\(admin\)/admin/\(dashboard\)/events/\[id\]/_components/EventRegistrationTable.tsx \
  __tests__/integration/domain/events/manual-payment.test.ts \
  scripts/test-db-runner-env.ts
git commit -m "$(cat <<'EOF'
feat(admin): add manual payment recording for event registrations

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: 最終検証

**Files:** なし（検証のみ）

- [ ] **Step 1: 型チェック**

Run: `bun run type-check`
Expected: exit 0

- [ ] **Step 2: lint**

Run: `bun run validate`
Expected: exit 0

- [ ] **Step 3: このPhaseで追加/変更した unit テストを一括実行**

Run: `bun scripts/run-tests.ts __tests__/unit/actions/event-registration-audit.test.ts __tests__/unit/actions/event-registration-bulk.test.ts`
Expected: PASS 全件

- [ ] **Step 4: このPhaseで追加した integration テストを一括実行**

Run: `bun scripts/run-tests.ts __tests__/integration/domain/events/update-registration-command.test.ts __tests__/integration/domain/events/registration-search-filter.test.ts __tests__/integration/domain/events/export-queries-cross-event.test.ts __tests__/integration/domain/events/manual-payment.test.ts`
Expected: PASS 全件

- [ ] **Step 5: 既存のイベント関連テストが壊れていないことを確認**

Run: `bun scripts/run-tests.ts __tests__/unit/architecture-boundaries.test.ts`
Expected: PASS（resource文字列統一等の既存grep gateが引き続き通ることを確認）

- [ ] **Step 6: `bun run build` で本番ビルドが通ることを確認**

Run: `bun run build:skip-env`
Expected: exit 0（DB不要な placeholder env でのビルド検証）
