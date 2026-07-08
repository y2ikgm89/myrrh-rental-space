# ゲスト→マイページ Claim 連携 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ゲスト予約/イベント参加申込者が、確認完了ページ・確認メール・予約リマインダーメールから1クリック(Google/LINE OAuth)でその1件だけをマイページに紐付けられるようにする。既にマイページ登録済みの人がログアウト状態でゲスト提出した場合も、同じ導線で自然に自分のアカウントへ反映される。

**Architecture:** 署名付き・ステートレスな claim トークン(`crypto.ts` purpose-scoped 暗号、既存の `reservation-cancel-token.ts` と同型)を2種(reservation-claim / event-registration-claim)新設する。トークンは `proxy.ts` が既存の `cancel-token` 転写と同じパターンで HttpOnly cookie に移し替える(ただし OAuth の外部リダイレクト往復を生き残らせるため `sameSite: "lax"` にする — cancel-token の `strict` とはここが異なる、理由は Task 3 参照)。`/claim/reservation` と `/claim/event-registration` の2つの読み取り専用ページ(`reservation/cancel` ページと同じ設計: 内容表示 + 確認ボタン、ページ描画時に副作用を起こさない)で、未ログインなら OAuth ボタン、ログイン済みなら「マイページに追加する」ボタンを出し、クリックで Server Action が `updateMany` の WHERE 現在値ガードによる compare-and-swap で対象1件だけを再紐付けする。emailの一致では一切判断しない。

**Tech Stack:** Next.js 16 App Router (Server Components / Server Actions) / Prisma 7 / Better Auth (`signIn.social`) / `crypto.ts` (AES-256-GCM + HKDF) / bun test

## Global Constraints

- テストは必ず `bun scripts/run-tests.ts <path>` 経由（素の `bun test` 禁止）
- Prisma は `@/shared/db/prisma` からのみ import、import するファイルは `import "server-only"` 必須
- `src/app/*` から Prisma 直 import 禁止（今回の新規ファイルは `src/shared/domain`/`src/shared/lib` 配下のみで書込を行う）
- `any` / non-null assertion(`!`) / `@ts-ignore` / 危険 cast は grep gate で 0 件強制
- 新規 migration は無し（既存 `Reservation.customerId` / `EventRegistration.customerId` カラムを update するのみ）
- 新規 `AuditAction` enum 値は追加しない（既存 `AuditAction.UPDATE` を再利用、`cancellation-side-effects.ts:293-297` の precedent に倣う）
- Next.js `<Link>` は使わない箇所がある(claim CTA は prefetch でページの副作用を誘発しないよう素の `<a>` を使う、Task 12/16 参照)
- 完了報告前に `bun run validate` を必ず実行。コミット前は `bun run validate && bun run build`
- コミットメッセージは Conventional Commits + `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

## Phase 1: 基盤(トークン・claim command・`/claim` ルート)

### Task 1: 予約 claim トークン

**Files:**

- Create: `src/shared/lib/reservation-claim-token.ts`
- Test: `__tests__/unit/shared/lib/reservation-claim-token.test.ts`

**Interfaces:**

- Produces: `createReservationClaimToken(reservationId: string, issuedAt?: Date): string`、`verifyReservationClaimToken(token: string, now: Date): { valid: true; reservationId: string } | { valid: false }`、`MAX_RESERVATION_CLAIM_TOKEN_LIFETIME_MS: number`

- [ ] **Step 1: 失敗するテストを書く**

`__tests__/unit/shared/lib/reservation-claim-token.test.ts`:

```ts
import { describe, test, expect } from "bun:test";
import {
  createReservationClaimToken,
  verifyReservationClaimToken,
  MAX_RESERVATION_CLAIM_TOKEN_LIFETIME_MS,
} from "@/shared/lib/reservation-claim-token";

const RID = "11111111-1111-4111-8111-111111111111";

describe("createReservationClaimToken / verifyReservationClaimToken", () => {
  test("往復で reservationId を復元できる", () => {
    const issuedAt = new Date("2026-04-01T00:00:00Z");
    const now = new Date("2026-04-01T00:00:01Z");
    const token = createReservationClaimToken(RID, issuedAt);
    expect(verifyReservationClaimToken(token, now)).toEqual({
      valid: true,
      reservationId: RID,
    });
  });

  test("issuedAt 省略時は呼び出し時刻から7日後が exp になる", () => {
    const before = Date.now();
    const token = createReservationClaimToken(RID);
    const justBeforeExpiry = new Date(
      before + MAX_RESERVATION_CLAIM_TOKEN_LIFETIME_MS - 1000,
    );
    expect(verifyReservationClaimToken(token, justBeforeExpiry)).toEqual({
      valid: true,
      reservationId: RID,
    });
  });

  test("7日を過ぎたトークンは invalid", () => {
    const issuedAt = new Date("2026-04-01T00:00:00Z");
    const afterExpiry = new Date(
      issuedAt.getTime() + MAX_RESERVATION_CLAIM_TOKEN_LIFETIME_MS + 1000,
    );
    const token = createReservationClaimToken(RID, issuedAt);
    expect(verifyReservationClaimToken(token, afterExpiry)).toEqual({
      valid: false,
    });
  });

  test("トークンは URL セーフ（base64url 文字のみ）", () => {
    const token = createReservationClaimToken(RID);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/u);
  });

  test("改ざんされたトークンは invalid", () => {
    const token = createReservationClaimToken(RID);
    const tampered =
      token.slice(0, -4) + (token.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(verifyReservationClaimToken(tampered, new Date())).toEqual({
      valid: false,
    });
  });

  test("キャンセルトークン(別purpose)は claim トークンとして通らない", async () => {
    const { createCancelToken } =
      await import("@/shared/lib/reservation-cancel-token");
    const cancelToken = createCancelToken(
      RID,
      new Date(Date.now() + 24 * 60 * 60 * 1000),
    );
    expect(verifyReservationClaimToken(cancelToken, new Date())).toEqual({
      valid: false,
    });
  });

  test("トークン形式でない文字列は invalid", () => {
    expect(verifyReservationClaimToken("not-a-real-token", new Date())).toEqual(
      { valid: false },
    );
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `bun scripts/run-tests.ts __tests__/unit/shared/lib/reservation-claim-token.test.ts`
Expected: FAIL（`reservation-claim-token` モジュールが存在しない）

- [ ] **Step 3: 実装**

`src/shared/lib/reservation-claim-token.ts`（既存 `reservation-cancel-token.ts` と同型、purpose と有効期限計算だけ変える）:

```ts
import "server-only";

import { encrypt, decrypt } from "@/shared/lib/crypto";
import { isRecord } from "@/shared/lib/serialize";

/**
 * 予約 claim トークン
 *
 * ゲスト予約完了ページ・確認メール・リマインダーメールの「マイページに追加」導線で使う。
 * 予約ID と有効期限を認証付き暗号（AES-256-GCM + HKDF）で封入する、ステートレスなトークン。
 *
 * emailの一致では判断しない。このトークンの保有（=確認メール/完了ページへのアクセス）と、
 * claim 実行時点の OAuth 認証（Google/LINE が保証する identity）の両方が揃って初めて
 * 「その予約1件だけ」を再紐付けする（`src/shared/domain/reservations/claim-commands.ts` 参照）。
 *
 * キャンセルトークン（`reservation-cancel-token.ts`）とは purpose を分け、verify 側で
 * purpose を明示検証する（他用途トークンの流用防止、`crypto.ts` の設計に準拠）。
 */

const PURPOSE = "reservation-claim";

/** トークンの最大有効期間（発行から固定7日）。キャンセルトークンと異なり予約開始時刻に
 *  連動する可変上限は不要（claim は予約の実行タイミングに影響しない操作のため）。 */
export const MAX_RESERVATION_CLAIM_TOKEN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

interface ClaimTokenPayload {
  /** 予約ID（UUID） */
  rid: string;
  /** 有効期限（ms epoch） */
  exp: number;
}

export type VerifyReservationClaimTokenResult =
  { valid: true; reservationId: string } | { valid: false };

/**
 * claim トークンを生成する。
 *
 * @param reservationId 予約ID
 * @param issuedAt 発行時刻（省略時は `new Date()`）。有効期限は発行時刻+7日固定。
 */
export function createReservationClaimToken(
  reservationId: string,
  issuedAt: Date = new Date(),
): string {
  const payload: ClaimTokenPayload = {
    rid: reservationId,
    exp: issuedAt.getTime() + MAX_RESERVATION_CLAIM_TOKEN_LIFETIME_MS,
  };
  const ciphertext = encrypt(JSON.stringify(payload), { purpose: PURPOSE });
  return Buffer.from(ciphertext, "utf8").toString("base64url");
}

/**
 * claim トークンを検証する。
 *
 * 期限切れ・改ざん・他用途（キャンセル等）のトークンはすべて `{ valid: false }` として扱う
 * （理由の区別は不要、`reservation-complete-token.ts` と同方針）。
 */
export function verifyReservationClaimToken(
  token: string,
  now: Date,
): VerifyReservationClaimTokenResult {
  let ciphertext: string;
  try {
    ciphertext = Buffer.from(token, "base64url").toString("utf8");
  } catch {
    return { valid: false };
  }

  // purpose を明示検証（wire format: v1: parts[1] / v2: parts[2]）。
  const parts = ciphertext.split(":");
  const version = parts[0];
  const purposeFromWire =
    version === "v2" ? parts[2] : version === "v1" ? parts[1] : null;
  if (purposeFromWire !== PURPOSE) {
    return { valid: false };
  }

  let raw: string;
  try {
    raw = decrypt(ciphertext);
  } catch {
    return { valid: false };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { valid: false };
  }

  if (!isClaimTokenPayload(payload)) {
    return { valid: false };
  }

  if (payload.exp < now.getTime()) {
    return { valid: false };
  }

  return { valid: true, reservationId: payload.rid };
}

function isClaimTokenPayload(value: unknown): value is ClaimTokenPayload {
  if (!isRecord(value)) return false;
  return (
    typeof value["rid"] === "string" &&
    typeof value["exp"] === "number" &&
    Number.isFinite(value["exp"])
  );
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `bun scripts/run-tests.ts __tests__/unit/shared/lib/reservation-claim-token.test.ts`
Expected: PASS（全 7 テスト）

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/reservation-claim-token.ts __tests__/unit/shared/lib/reservation-claim-token.test.ts
git commit -m "feat(reservations): add stateless claim token for guest-to-mypage linking"
```

---

### Task 2: イベント参加 claim トークン

**Files:**

- Create: `src/shared/lib/event-registration-claim-token.ts`
- Test: `__tests__/unit/shared/lib/event-registration-claim-token.test.ts`

**Interfaces:**

- Produces: `createEventRegistrationClaimToken(eventRegistrationId: string, issuedAt?: Date): string`、`verifyEventRegistrationClaimToken(token: string, now: Date): { valid: true; eventRegistrationId: string } | { valid: false }`、`MAX_EVENT_REGISTRATION_CLAIM_TOKEN_LIFETIME_MS: number`

- [ ] **Step 1: 失敗するテストを書く**

`__tests__/unit/shared/lib/event-registration-claim-token.test.ts`（Task 1 と同型、`eid` フィールド名のみ変える）:

```ts
import { describe, test, expect } from "bun:test";
import {
  createEventRegistrationClaimToken,
  verifyEventRegistrationClaimToken,
  MAX_EVENT_REGISTRATION_CLAIM_TOKEN_LIFETIME_MS,
} from "@/shared/lib/event-registration-claim-token";

const EID = "22222222-2222-4222-8222-222222222222";

describe("createEventRegistrationClaimToken / verifyEventRegistrationClaimToken", () => {
  test("往復で eventRegistrationId を復元できる", () => {
    const issuedAt = new Date("2026-04-01T00:00:00Z");
    const now = new Date("2026-04-01T00:00:01Z");
    const token = createEventRegistrationClaimToken(EID, issuedAt);
    expect(verifyEventRegistrationClaimToken(token, now)).toEqual({
      valid: true,
      eventRegistrationId: EID,
    });
  });

  test("issuedAt 省略時は呼び出し時刻から7日後が exp になる", () => {
    const before = Date.now();
    const token = createEventRegistrationClaimToken(EID);
    const justBeforeExpiry = new Date(
      before + MAX_EVENT_REGISTRATION_CLAIM_TOKEN_LIFETIME_MS - 1000,
    );
    expect(verifyEventRegistrationClaimToken(token, justBeforeExpiry)).toEqual({
      valid: true,
      eventRegistrationId: EID,
    });
  });

  test("7日を過ぎたトークンは invalid", () => {
    const issuedAt = new Date("2026-04-01T00:00:00Z");
    const afterExpiry = new Date(
      issuedAt.getTime() +
        MAX_EVENT_REGISTRATION_CLAIM_TOKEN_LIFETIME_MS +
        1000,
    );
    const token = createEventRegistrationClaimToken(EID, issuedAt);
    expect(verifyEventRegistrationClaimToken(token, afterExpiry)).toEqual({
      valid: false,
    });
  });

  test("トークンは URL セーフ（base64url 文字のみ）", () => {
    const token = createEventRegistrationClaimToken(EID);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/u);
  });

  test("改ざんされたトークンは invalid", () => {
    const token = createEventRegistrationClaimToken(EID);
    const tampered =
      token.slice(0, -4) + (token.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(verifyEventRegistrationClaimToken(tampered, new Date())).toEqual({
      valid: false,
    });
  });

  test("予約 claim トークン(別purpose)はイベント claim トークンとして通らない", async () => {
    const { createReservationClaimToken } =
      await import("@/shared/lib/reservation-claim-token");
    const reservationToken = createReservationClaimToken(EID);
    expect(
      verifyEventRegistrationClaimToken(reservationToken, new Date()),
    ).toEqual({ valid: false });
  });

  test("トークン形式でない文字列は invalid", () => {
    expect(
      verifyEventRegistrationClaimToken("not-a-real-token", new Date()),
    ).toEqual({ valid: false });
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `bun scripts/run-tests.ts __tests__/unit/shared/lib/event-registration-claim-token.test.ts`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装**

`src/shared/lib/event-registration-claim-token.ts`:

```ts
import "server-only";

import { encrypt, decrypt } from "@/shared/lib/crypto";
import { isRecord } from "@/shared/lib/serialize";

/**
 * イベント参加申込 claim トークン。設計は `reservation-claim-token.ts` と同一
 * （purpose のみ分離）。詳細なコメントはそちらを参照。
 */

const PURPOSE = "event-registration-claim";

export const MAX_EVENT_REGISTRATION_CLAIM_TOKEN_LIFETIME_MS =
  7 * 24 * 60 * 60 * 1000;

interface ClaimTokenPayload {
  /** イベント参加申込ID（UUID） */
  eid: string;
  /** 有効期限（ms epoch） */
  exp: number;
}

export type VerifyEventRegistrationClaimTokenResult =
  { valid: true; eventRegistrationId: string } | { valid: false };

export function createEventRegistrationClaimToken(
  eventRegistrationId: string,
  issuedAt: Date = new Date(),
): string {
  const payload: ClaimTokenPayload = {
    eid: eventRegistrationId,
    exp: issuedAt.getTime() + MAX_EVENT_REGISTRATION_CLAIM_TOKEN_LIFETIME_MS,
  };
  const ciphertext = encrypt(JSON.stringify(payload), { purpose: PURPOSE });
  return Buffer.from(ciphertext, "utf8").toString("base64url");
}

export function verifyEventRegistrationClaimToken(
  token: string,
  now: Date,
): VerifyEventRegistrationClaimTokenResult {
  let ciphertext: string;
  try {
    ciphertext = Buffer.from(token, "base64url").toString("utf8");
  } catch {
    return { valid: false };
  }

  const parts = ciphertext.split(":");
  const version = parts[0];
  const purposeFromWire =
    version === "v2" ? parts[2] : version === "v1" ? parts[1] : null;
  if (purposeFromWire !== PURPOSE) {
    return { valid: false };
  }

  let raw: string;
  try {
    raw = decrypt(ciphertext);
  } catch {
    return { valid: false };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { valid: false };
  }

  if (!isClaimTokenPayload(payload)) {
    return { valid: false };
  }

  if (payload.exp < now.getTime()) {
    return { valid: false };
  }

  return { valid: true, eventRegistrationId: payload.eid };
}

function isClaimTokenPayload(value: unknown): value is ClaimTokenPayload {
  if (!isRecord(value)) return false;
  return (
    typeof value["eid"] === "string" &&
    typeof value["exp"] === "number" &&
    Number.isFinite(value["exp"])
  );
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `bun scripts/run-tests.ts __tests__/unit/shared/lib/event-registration-claim-token.test.ts`
Expected: PASS（全 7 テスト）

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/event-registration-claim-token.ts __tests__/unit/shared/lib/event-registration-claim-token.test.ts
git commit -m "feat(events): add stateless claim token for guest-to-mypage linking"
```

---

### Task 3: `proxy.ts` — claim トークンの HttpOnly cookie 転写

既存の「ゲストキャンセル token 転写」（`CANCEL_TOKEN_COOKIE_NAME`、`handleGuestCancelTokenTransfer`）と同じ理由・同じ仕組みで、`?token=` を URL に残さず HttpOnly cookie に移す。**ただし `sameSite` は `"strict"` ではなく `"lax"` にする**: このトークンは Google/LINE への外部リダイレクト（OAuth）を経由して戻ってくる。SameSite=Strict の cookie は「他サイトからの top-level navigation」では送信されないため、OAuth コールバックで戻ってきた際に cookie が消えて claim が失敗する。SameSite=Lax は top-level GET navigation では送信されるため、この往復を生き残る。ゲストキャンセルは外部サイトを経由しないため `strict` のままで問題ない（既存動作は変更しない）。

既存の `__tests__/unit/proxy-public-surface.test.ts` / `__tests__/unit/proxy-admin-gate.test.ts` と同様、機能ごとに専用ファイルを切る既存命名規約に倣い、`proxy-claim-token-transfer.test.ts` を新規作成する（`__tests__/unit/proxy.test.ts` という単一ファイルは存在しないことを `Glob "__tests__/unit/proxy*.test.ts"` で確認済み）。

**Files:**

- Modify: `src/proxy.ts`
- Create: `__tests__/unit/proxy-claim-token-transfer.test.ts`

**Interfaces:**

- Consumes: なし（新規定数のみ）
- Produces: cookie 名 `RESERVATION_CLAIM_TOKEN_COOKIE_NAME = "reservation-claim-token"`、`EVENT_REGISTRATION_CLAIM_TOKEN_COOKIE_NAME = "event-registration-claim-token"`（Task 6/7 の action がこれを読む）

- [ ] **Step 1: 失敗するテストを書く**

`__tests__/unit/proxy-claim-token-transfer.test.ts` を新規作成する:

```ts
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { createReservationClaimToken } from "@/shared/lib/reservation-claim-token";
import { createEventRegistrationClaimToken } from "@/shared/lib/event-registration-claim-token";

describe("claim token transfer", () => {
  test("/claim/reservation の ?token= を HttpOnly cookie に転写し URL から外す", async () => {
    const token = createReservationClaimToken(
      "11111111-1111-4111-8111-111111111111",
    );
    const req = new NextRequest(
      `https://example.com/claim/reservation?token=${token}`,
    );
    const res = await proxy(req);
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.searchParams.get("token")).toBeNull();
    const cookie = res.cookies.get("reservation-claim-token");
    expect(cookie?.value).toBe(token);
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.httpOnly).toBe(true);
  });

  test("/claim/event-registration の ?token= を HttpOnly cookie に転写する", async () => {
    const token = createEventRegistrationClaimToken(
      "22222222-2222-4222-8222-222222222222",
    );
    const req = new NextRequest(
      `https://example.com/claim/event-registration?token=${token}`,
    );
    const res = await proxy(req);
    const cookie = res.cookies.get("event-registration-claim-token");
    expect(cookie?.value).toBe(token);
    expect(cookie?.sameSite).toBe("lax");
  });

  test("不正形式の token は cookie に書かず ?token だけ外す", async () => {
    const req = new NextRequest(
      "https://example.com/claim/reservation?token=short",
    );
    const res = await proxy(req);
    expect(res.cookies.get("reservation-claim-token")).toBeUndefined();
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.searchParams.get("token")).toBeNull();
  });

  test("token なしの /claim/reservation は素通り（redirect しない）", async () => {
    const req = new NextRequest("https://example.com/claim/reservation");
    const res = await proxy(req);
    expect(res.status).not.toBe(307);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `bun scripts/run-tests.ts __tests__/unit/proxy-claim-token-transfer.test.ts`
Expected: FAIL（cookie 転写ロジックが存在しない）

- [ ] **Step 3: `src/proxy.ts` に転写ロジックを追加**

既存の `CANCEL_TOKEN_COOKIE_NAME` / `CANCEL_TOKEN_COOKIE_MAX_AGE` / `CANCEL_TOKEN_PATTERN` / `handleGuestCancelTokenTransfer` の直後に追加:

```ts
const CLAIM_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,1024}$/;
// OAuth 往復（Google/LINE への外部リダイレクトを経由して戻る）を生き越えるため 60 分。
// cancel-token（サイト外遷移が無い）より長めに取っている。
const CLAIM_TOKEN_COOKIE_MAX_AGE = 60 * 60; // 60 分
const RESERVATION_CLAIM_TOKEN_COOKIE_NAME = "reservation-claim-token";
const EVENT_REGISTRATION_CLAIM_TOKEN_COOKIE_NAME =
  "event-registration-claim-token";

function handleClaimTokenTransfer(
  req: NextRequest,
  pathname: string,
  cookieName: string,
): NextResponse | null {
  const { searchParams } = req.nextUrl;
  if (req.nextUrl.pathname !== pathname) return null;
  const token = searchParams.get("token");
  if (!token) return null;

  const cleanUrl = new URL(req.url);
  cleanUrl.searchParams.delete("token");
  const response = NextResponse.redirect(cleanUrl);

  if (CLAIM_TOKEN_PATTERN.test(token)) {
    response.cookies.set({
      name: cookieName,
      value: token,
      httpOnly: true,
      // OAuth コールバックは他サイト(Google/LINE)からの top-level navigation で
      // 戻ってくるため、SameSite=Strict だと cookie が送信されず claim が失敗する。
      // Lax は top-level GET navigation では送信されるため往復を生き残る。
      sameSite: "lax",
      secure: !isLocalhostRequest(req),
      path: "/",
      maxAge: CLAIM_TOKEN_COOKIE_MAX_AGE,
    });
  }
  return response;
}
```

`proxy()` 関数冒頭（`handleGuestCancelTokenTransfer` 呼び出しの直後）に追加:

```ts
const reservationClaimTransfer = handleClaimTokenTransfer(
  req,
  "/claim/reservation",
  RESERVATION_CLAIM_TOKEN_COOKIE_NAME,
);
if (reservationClaimTransfer) return reservationClaimTransfer;

const eventRegistrationClaimTransfer = handleClaimTokenTransfer(
  req,
  "/claim/event-registration",
  EVENT_REGISTRATION_CLAIM_TOKEN_COOKIE_NAME,
);
if (eventRegistrationClaimTransfer) return eventRegistrationClaimTransfer;
```

`RESERVATION_CLAIM_TOKEN_COOKIE_NAME` / `EVENT_REGISTRATION_CLAIM_TOKEN_COOKIE_NAME` を `export` して Task 6/7 から import できるようにする。

- [ ] **Step 4: テストが通ることを確認**

Run: `bun scripts/run-tests.ts __tests__/unit/proxy-claim-token-transfer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/proxy.ts __tests__/unit/proxy-claim-token-transfer.test.ts
git commit -m "feat(proxy): transfer claim tokens to HttpOnly SameSite=Lax cookies"
```

---

### Task 4: 予約 claim command（compare-and-swap、先着1名のみ成立）

**Files:**

- Create: `src/shared/domain/reservations/claim-commands.ts`
- Test: `__tests__/integration/reservations/claim-commands.test.ts`（実DB使用。`scripts/test-db-runner-env.ts` の `SERIAL_DB_TESTS` にフルパス登録必須）

**Interfaces:**

- Consumes: `prisma`（`@/shared/db/prisma`）
- Produces: `claimReservationForCustomer(reservationId: string, toCustomerId: string): Promise<{ claimed: boolean }>`

- [ ] **Step 1: 失敗する統合テストを書く**

`__tests__/integration/reservations/claim-commands.test.ts`:

```ts
import { describe, test, expect, beforeAll, afterAll } from "bun:test";

process.env["DATABASE_URL"] =
  process.env["TEST_DATABASE_URL"] ?? process.env["DATABASE_URL"];

const { prisma } = await import("@/shared/db/prisma");
const { basePrisma } = await import("@/shared/db/prisma");
const { claimReservationForCustomer } =
  await import("@/shared/domain/reservations/claim-commands");

async function createGuestReservationWithCustomer() {
  const guestCustomer = await prisma.customer.create({
    data: {
      email: "guest@example.com",
      emailCanonical: "guest@example.com",
      lastName: "ゲスト",
      firstName: "太郎",
      userId: null,
    },
  });
  const space = await prisma.space.findFirstOrThrow();
  const reservation = await prisma.reservation.create({
    data: {
      spaceId: space.id,
      customerId: guestCustomer.id,
      startTime: new Date("2026-05-01T01:00:00Z"),
      endTime: new Date("2026-05-01T02:00:00Z"),
      totalPrice: 1000,
      guestLastName: "ゲスト",
      guestFirstName: "太郎",
      guestEmail: "guest@example.com",
    },
  });
  return { guestCustomer, reservation };
}

async function createLinkedCustomer(userIdSuffix: string) {
  const user = await prisma.user.create({
    data: {
      email: `member-${userIdSuffix}@example.com`,
      name: "会員太郎",
      emailVerified: true,
    },
  });
  const customer = await prisma.customer.create({
    data: {
      email: user.email,
      emailCanonical: user.email,
      lastName: "会員",
      firstName: "太郎",
      userId: user.id,
    },
  });
  return customer;
}

describe("claimReservationForCustomer", () => {
  afterAll(async () => {
    await basePrisma.$disconnect();
  });

  test("未紐付けゲスト予約を会員Customerへ再紐付けする", async () => {
    const { reservation } = await createGuestReservationWithCustomer();
    const member = await createLinkedCustomer("a");

    const result = await claimReservationForCustomer(reservation.id, member.id);
    expect(result).toEqual({ claimed: true });

    const updated = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservation.id },
    });
    expect(updated.customerId).toBe(member.id);
  });

  test("同じ会員が再度claimしても idempotent に成功扱い", async () => {
    const { reservation } = await createGuestReservationWithCustomer();
    const member = await createLinkedCustomer("b");

    await claimReservationForCustomer(reservation.id, member.id);
    const second = await claimReservationForCustomer(reservation.id, member.id);
    expect(second).toEqual({ claimed: true });
  });

  test("既に別会員へclaim済みなら、後発のclaimは横取りできず失敗する", async () => {
    const { reservation } = await createGuestReservationWithCustomer();
    const firstMember = await createLinkedCustomer("c");
    const secondMember = await createLinkedCustomer("d");

    const first = await claimReservationForCustomer(
      reservation.id,
      firstMember.id,
    );
    expect(first).toEqual({ claimed: true });

    const second = await claimReservationForCustomer(
      reservation.id,
      secondMember.id,
    );
    expect(second).toEqual({ claimed: false });

    const updated = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservation.id },
    });
    expect(updated.customerId).toBe(firstMember.id);
  });

  test("存在しない予約IDは claimed: false", async () => {
    const member = await createLinkedCustomer("e");
    const result = await claimReservationForCustomer(
      "00000000-0000-4000-8000-000000000000",
      member.id,
    );
    expect(result).toEqual({ claimed: false });
  });
});
```

- [ ] **Step 2: `scripts/test-db-runner-env.ts` の `SERIAL_DB_TESTS` にフルパスを登録**

`scripts/test-db-runner-env.ts` を開き、既存の実DB統合テストパス配列（`SERIAL_DB_TESTS`）に `"__tests__/integration/reservations/claim-commands.test.ts"` を追加する。

- [ ] **Step 3: 失敗を確認**

Run: `bun scripts/run-tests.ts __tests__/integration/reservations/claim-commands.test.ts`
Expected: FAIL（`claim-commands` モジュールが存在しない）

- [ ] **Step 4: 実装**

`src/shared/domain/reservations/claim-commands.ts`:

```ts
import "server-only";

import { prisma } from "@/shared/db/prisma";

/**
 * ゲスト予約を会員Customerへ再紐付けする（compare-and-swap）。
 *
 * email の一致では判断しない。呼び出し元（`/claim/reservation` action）が
 * 署名付き claim トークンの保有 + OAuth 認証の両方を確認した上でのみ呼ぶ。
 *
 * 「先着1名のみ成立」を保証する: 現在の customerId を読み、それが既に
 * 別の会員（userId が非null）に紐付いていれば横取りを拒否する。読んだ
 * customerId をそのまま updateMany の WHERE ガードに使うことで、UPDATE の
 * WHERE 再評価（PostgreSQL の行ロック取得後に最新コミット済み状態で評価される）
 * により、同時に2件の claim が競合しても後着は必ず 0 件更新になる
 * （`claimReservationAsPaid` と同じ「updateMany の WHERE で claim」パターン）。
 *
 * @returns 既に自分（`toCustomerId`）へclaim済みの場合も idempotent に `claimed: true`。
 *   既に他の会員へclaim済み、または予約が存在しない場合は `claimed: false`。
 */
export async function claimReservationForCustomer(
  reservationId: string,
  toCustomerId: string,
): Promise<{ claimed: boolean }> {
  const current = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: { customerId: true },
  });
  if (!current) {
    return { claimed: false };
  }

  if (current.customerId === toCustomerId) {
    return { claimed: true };
  }

  const currentCustomer = await prisma.customer.findUnique({
    where: { id: current.customerId },
    select: { userId: true },
  });
  if (currentCustomer?.userId != null) {
    return { claimed: false };
  }

  const result = await prisma.reservation.updateMany({
    where: { id: reservationId, customerId: current.customerId },
    data: { customerId: toCustomerId },
  });
  return { claimed: result.count > 0 };
}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `bun scripts/run-tests.ts __tests__/integration/reservations/claim-commands.test.ts`
Expected: PASS（全 4 テスト）

- [ ] **Step 6: Commit**

```bash
git add src/shared/domain/reservations/claim-commands.ts __tests__/integration/reservations/claim-commands.test.ts scripts/test-db-runner-env.ts
git commit -m "feat(reservations): add race-safe claim command for guest-to-mypage linking"
```

---

### Task 5: イベント参加 claim command

**Files:**

- Create: `src/shared/domain/events/claim-commands.ts`
- Test: `__tests__/integration/events/claim-commands.test.ts`（`SERIAL_DB_TESTS` に登録）

**Interfaces:**

- Produces: `claimEventRegistrationForCustomer(eventRegistrationId: string, toCustomerId: string): Promise<{ claimed: boolean }>`

- [ ] **Step 1: 失敗する統合テストを書く**

`__tests__/integration/events/claim-commands.test.ts`:

```ts
import { describe, test, expect, afterAll } from "bun:test";

process.env["DATABASE_URL"] =
  process.env["TEST_DATABASE_URL"] ?? process.env["DATABASE_URL"];

const { prisma, basePrisma } = await import("@/shared/db/prisma");
const { claimEventRegistrationForCustomer } =
  await import("@/shared/domain/events/claim-commands");
const { RegistrationStatus } =
  await import("@/shared/lib/validations/enums/prisma-types");

async function createGuestEventRegistration() {
  const event = await prisma.event.findFirstOrThrow();
  const slot = await prisma.eventSlot.findFirstOrThrow({
    where: { eventId: event.id },
  });
  return prisma.eventRegistration.create({
    data: {
      eventId: event.id,
      slotId: slot.id,
      name: "ゲスト太郎",
      email: "event-guest@example.com",
      quantity: 1,
      status: RegistrationStatus.CONFIRMED,
      customerId: null,
    },
  });
}

async function createLinkedCustomer(userIdSuffix: string) {
  const user = await prisma.user.create({
    data: {
      email: `event-member-${userIdSuffix}@example.com`,
      name: "会員太郎",
      emailVerified: true,
    },
  });
  return prisma.customer.create({
    data: {
      email: user.email,
      emailCanonical: user.email,
      lastName: "会員",
      firstName: "太郎",
      userId: user.id,
    },
  });
}

describe("claimEventRegistrationForCustomer", () => {
  afterAll(async () => {
    await basePrisma.$disconnect();
  });

  test("customerId: null のゲスト申込を会員Customerへ紐付ける", async () => {
    const registration = await createGuestEventRegistration();
    const member = await createLinkedCustomer("a");

    const result = await claimEventRegistrationForCustomer(
      registration.id,
      member.id,
    );
    expect(result).toEqual({ claimed: true });

    const updated = await prisma.eventRegistration.findUniqueOrThrow({
      where: { id: registration.id },
    });
    expect(updated.customerId).toBe(member.id);
  });

  test("既に customerId が設定済みなら以降のclaimは全て失敗する", async () => {
    const registration = await createGuestEventRegistration();
    const firstMember = await createLinkedCustomer("b");
    const secondMember = await createLinkedCustomer("c");

    await claimEventRegistrationForCustomer(registration.id, firstMember.id);
    const second = await claimEventRegistrationForCustomer(
      registration.id,
      secondMember.id,
    );
    expect(second).toEqual({ claimed: false });
  });

  test("存在しない申込IDは claimed: false", async () => {
    const member = await createLinkedCustomer("d");
    const result = await claimEventRegistrationForCustomer(
      "00000000-0000-4000-8000-000000000000",
      member.id,
    );
    expect(result).toEqual({ claimed: false });
  });
});
```

- [ ] **Step 2: `SERIAL_DB_TESTS` にフルパスを登録**

`scripts/test-db-runner-env.ts` に `"__tests__/integration/events/claim-commands.test.ts"` を追加。

- [ ] **Step 3: 失敗を確認**

Run: `bun scripts/run-tests.ts __tests__/integration/events/claim-commands.test.ts`
Expected: FAIL

- [ ] **Step 4: 実装**

`src/shared/domain/events/claim-commands.ts`:

```ts
import "server-only";

import { prisma } from "@/shared/db/prisma";

/**
 * ゲストのイベント参加申込（`customerId: null`）を会員Customerへ紐付ける。
 *
 * `customerId: null` であることそのものが「未claim」のガードになるため、
 * 予約（`reservations/claim-commands.ts`）のような事前読み取りは不要で、
 * 単発の updateMany で「先着1名のみ成立」が保証される。
 */
export async function claimEventRegistrationForCustomer(
  eventRegistrationId: string,
  toCustomerId: string,
): Promise<{ claimed: boolean }> {
  const result = await prisma.eventRegistration.updateMany({
    where: { id: eventRegistrationId, customerId: null },
    data: { customerId: toCustomerId },
  });
  if (result.count > 0) {
    return { claimed: true };
  }

  // 既にclaim済みの場合、それが「自分」自身へのclaimなら idempotent に成功扱いする。
  const current = await prisma.eventRegistration.findUnique({
    where: { id: eventRegistrationId },
    select: { customerId: true },
  });
  return { claimed: current?.customerId === toCustomerId };
}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `bun scripts/run-tests.ts __tests__/integration/events/claim-commands.test.ts`
Expected: PASS（全 3 テスト）

- [ ] **Step 6: Commit**

```bash
git add src/shared/domain/events/claim-commands.ts __tests__/integration/events/claim-commands.test.ts scripts/test-db-runner-env.ts
git commit -m "feat(events): add race-safe claim command for guest-to-mypage linking"
```

---

### Task 6: `SocialLoginButtons` の `callbackURL` を差し替え可能にする

**Files:**

- Modify: `src/app/(public)/login/_components/social-login-buttons.tsx:32-36,53-56,96-98`

**Interfaces:**

- Consumes: なし
- Produces: `SocialLoginButtonsProps.callbackURL?: string`（既定値 `"/mypage"`、Task 7/8 の `/claim/*` ページが上書きして使う）

- [ ] **Step 1: 型を変更**

`src/app/(public)/login/_components/social-login-buttons.tsx:32-36` を編集:

```ts
interface SocialLoginButtonsProps {
  readonly requiredTerms?: readonly SignupTermItem[];
  readonly turnstileSiteKey: string | null;
  /** 認証後のリダイレクト先。省略時は `/mypage`（既存動作を維持）。 */
  readonly callbackURL?: string;
}
```

- [ ] **Step 2: 関数シグネチャと使用箇所を変更**

`:53-56` を編集:

```ts
export function SocialLoginButtons({
  requiredTerms = [],
  turnstileSiteKey,
  callbackURL = "/mypage",
}: SocialLoginButtonsProps) {
```

`:96-98` を編集（`callbackURL: "/mypage"` → 変数参照）:

```ts
    void signIn.social({
      provider,
      callbackURL,
```

- [ ] **Step 3: 既存の呼び出し元に影響が無いことを確認**

Run: `bun run type-check`
Expected: 0 errors（`callbackURL` は optional のため既存の `<SocialLoginButtons requiredTerms={...} turnstileSiteKey={...} />` 呼び出し箇所は無変更で動く）

- [ ] **Step 4: Commit**

```bash
git add "src/app/(public)/login/_components/social-login-buttons.tsx"
git commit -m "feat(auth): allow SocialLoginButtons to override OAuth callbackURL"
```

---

### Task 7: `/claim/reservation` ページ + Server Action

既存の `src/app/(public)/reservation/cancel/` と同じ構造（page.tsx が読み取り専用でトークン検証+要約表示、`_actions/claim.ts` が実際の書込、`_components/` に確認ボタン）で作る。ページ描画時に副作用（claim）を起こさない — Next.js の `<Link>` prefetch や再訪問がそのまま claim を誘発しないようにするため。

**Files:**

- Create: `src/app/(public)/claim/reservation/page.tsx`
- Create: `src/app/(public)/claim/reservation/_actions/claim.ts`
- Create: `src/app/(public)/claim/reservation/_components/claim-confirm-form.tsx`

**Interfaces:**

- Consumes: `verifyReservationClaimToken`（Task 1）、`claimReservationForCustomer`（Task 4）、`ensureCustomerLinked`（既存 `@/shared/domain/customers/link`）、`getCurrentCustomerUser`/`getCustomerSession`（既存 `@/shared/lib/customer-auth`）、`getReservationForGuestCancel`（既存 `@/shared/domain/reservations/customer-queries`）、`RESERVATION_CLAIM_TOKEN_COOKIE_NAME`（Task 3、`@/proxy` から export）、`SocialLoginButtons`（Task 6）
- Produces: `claimReservationAction(): Promise<MutationResult<null>>`

- [ ] **Step 1: Server Action を実装**

`src/app/(public)/claim/reservation/_actions/claim.ts`:

```ts
"use server";

import { cookies } from "next/headers";
import { verifyReservationClaimToken } from "@/shared/lib/reservation-claim-token";
import { claimReservationForCustomer } from "@/shared/domain/reservations/claim-commands";
import { ensureCustomerLinked } from "@/shared/domain/customers/link";
import { getCustomerSession } from "@/shared/lib/customer-auth";
import { checkActionRateLimit } from "@/shared/lib/action-helpers";
import { formSubmitRateLimiter } from "@/shared/lib/rate-limit";
import {
  createMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { AuditAction } from "@generated/prisma/enums";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory } from "@/shared/lib/errors/server";

const RESERVATION_CLAIM_TOKEN_COOKIE_NAME = "reservation-claim-token";

export async function claimReservationAction(): Promise<
  MutationResult<{ reservationId: string }>
> {
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return createMutationError(rateLimit.error);

  const session = await getCustomerSession();
  if (!session) return createMutationError("認証が必要です");

  const cookieStore = await cookies();
  const token = cookieStore.get(RESERVATION_CLAIM_TOKEN_COOKIE_NAME)?.value;
  if (!token) {
    return createMutationError("リンクの有効期限が切れました");
  }

  const verified = verifyReservationClaimToken(token, new Date());
  if (!verified.valid) {
    return createMutationError("リンクの有効期限が切れました");
  }

  const { customer } = await ensureCustomerLinked(session.user);
  const result = await claimReservationForCustomer(
    verified.reservationId,
    customer.id,
  );
  if (!result.claimed) {
    return createMutationError(
      "この予約は既に別のアカウントに反映されているため、追加できませんでした",
    );
  }

  fireAndForget(
    createAuditLogRecord({
      userId: session.user.id,
      action: AuditAction.UPDATE,
      resource: "reservation",
      resourceId: verified.reservationId,
      newValue: { customerId: customer.id },
      metadata: { claim: true },
    }),
    { operation: "auditReservationClaim", category: ErrorCategory.DATABASE },
  );

  return { reservationId: verified.reservationId };
}
```

- [ ] **Step 2: 確認ボタンのクライアントコンポーネントを実装**

`src/app/(public)/claim/reservation/_components/claim-confirm-form.tsx`（`guest-cancel-form.tsx` と同じ `useTransition` + `MutationResult` パターン）:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/public/components/design-system/button";
import { isMutationError } from "@/shared/lib/mutation-result";
import { claimReservationAction } from "../_actions/claim";

export function ClaimConfirmForm() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleConfirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await claimReservationAction();
      if (isMutationError(result)) {
        setError(result.error);
        return;
      }
      router.push(`/mypage/reservations/${result.reservationId}`);
    });
  };

  return (
    <div className="space-y-4">
      {error != null && (
        <div
          className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      )}
      <Button onClick={handleConfirm} disabled={isPending}>
        {isPending ? "反映中..." : "この予約をマイページに追加する"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: ページを実装**

`src/app/(public)/claim/reservation/page.tsx`:

```tsx
import type { ReactElement } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { verifyReservationClaimToken } from "@/shared/lib/reservation-claim-token";
import { getReservationForGuestCancel } from "@/shared/domain/reservations/customer-queries";
import { getCurrentCustomerUser } from "@/shared/lib/customer-auth";
import { getTurnstileSiteKey } from "@/shared/data/turnstile";
import { getRequiredTermsByScope } from "@/shared/domain/terms/queries";
import { TermsScope } from "@/shared/lib/validations/enums/prisma-types";
import { formatSerializedDate } from "@/shared/lib/serialize";
import {
  publicQueryRateLimiter,
  getClientIpFromHeaders,
} from "@/shared/lib/rate-limit";
import { SocialLoginButtons } from "@/app/(public)/login/_components/social-login-buttons";
import { ClaimConfirmForm } from "./_components/claim-confirm-form";

const RESERVATION_CLAIM_TOKEN_COOKIE_NAME = "reservation-claim-token";

export const metadata: Metadata = {
  title: "予約をマイページに追加",
  robots: { index: false, follow: false },
};

export default async function ClaimReservationPage(): Promise<ReactElement> {
  await connection();

  const clientIp = await getClientIpFromHeaders();
  const limit = await publicQueryRateLimiter.check(clientIp);
  if (!limit.success) {
    return <InvalidView message="リクエストが多すぎます" />;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(RESERVATION_CLAIM_TOKEN_COOKIE_NAME)?.value;
  if (!token) {
    return <InvalidView />;
  }

  const verified = verifyReservationClaimToken(token, new Date());
  if (!verified.valid) {
    return <InvalidView />;
  }

  const reservation = await getReservationForGuestCancel(
    verified.reservationId,
  );
  if (!reservation) {
    return <InvalidView />;
  }

  const [user, turnstileSiteKey, requiredTerms] = await Promise.all([
    getCurrentCustomerUser(),
    getTurnstileSiteKey(),
    getRequiredTermsByScope(TermsScope.LOGIN_SIGNUP),
  ]);

  return (
    <Layout>
      <div className="border border-border p-4 sm:p-6">
        <Heading level={2} className="!text-xl">
          {reservation.space.name}
        </Heading>
        <p className="mt-2 text-sm text-muted-foreground">
          利用日:{" "}
          {formatSerializedDate(reservation.startTime, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {user ? (
        <ClaimConfirmForm />
      ) : (
        <Stack gap="md">
          <p className="text-sm text-muted-foreground">
            Google または LINE
            でログイン（初めての方は自動的にアカウントが作成されます）すると、この予約をマイページに追加できます。
          </p>
          <SocialLoginButtons
            requiredTerms={requiredTerms}
            turnstileSiteKey={turnstileSiteKey}
            callbackURL="/claim/reservation"
          />
        </Stack>
      )}
    </Layout>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <PageLayout variant="form">
      <Stack gap="lg" className="mx-auto max-w-2xl">
        <Heading level={1}>予約をマイページに追加</Heading>
        {children}
      </Stack>
    </PageLayout>
  );
}

function InvalidView({
  message = "リンクの有効期限が切れました",
}: {
  message?: string;
} = {}): ReactElement {
  return (
    <Layout>
      <div className="border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-base font-medium text-foreground">{message}</p>
      </div>
    </Layout>
  );
}
```

- [ ] **Step 4: 型チェック**

Run: `bun run type-check`
Expected: 0 errors

- [ ] **Step 5: E2E で一連の動作を確認（Playwright、OAuthはE2Eログインバイパスを使用）**

`e2e/` 配下に `claim-reservation.spec.ts` を新規作成し、以下を検証する:

1. ゲストとして予約を作成（既存の予約作成 E2E フローを流用）
2. 確認メール送信をモック/インターセプトし claim トークン付き URL を抽出（またはテスト用に直接 `createReservationClaimToken` で生成した URL に遷移）
3. `/claim/reservation?token=...` に遷移 → 予約概要が表示される
4. E2E ログインバイパスでログイン
5. 「この予約をマイページに追加する」をクリック
6. `/mypage/reservations/<id>` にリダイレクトされ、当該予約が表示されることを確認

（具体的な fixture 配線は `e2e-authoring` skill の手順に従う。既存の `e2e/fixtures` 内のゲスト予約作成ヘルパーを再利用する。）

- [ ] **Step 6: Commit**

```bash
git add "src/app/(public)/claim/reservation" e2e/claim-reservation.spec.ts
git commit -m "feat(reservations): add /claim/reservation page for guest-to-mypage linking"
```

---

### Task 8: `/claim/event-registration` ページ + Server Action

Task 7 と同型。イベント参加申込版。

**Files:**

- Create: `src/app/(public)/claim/event-registration/page.tsx`
- Create: `src/app/(public)/claim/event-registration/_actions/claim.ts`
- Create: `src/app/(public)/claim/event-registration/_components/claim-confirm-form.tsx`
- Modify: `src/shared/domain/events/registration-queries.ts`（claimページ要約表示用の新規クエリを追加）

**Interfaces:**

- Consumes: `verifyEventRegistrationClaimToken`（Task 2）、`claimEventRegistrationForCustomer`（Task 5）、`ensureCustomerLinked`、`getCustomerSession`/`getCurrentCustomerUser`、`EVENT_REGISTRATION_CLAIM_TOKEN_COOKIE_NAME`
- Produces: `getEventRegistrationForClaim(registrationId: string): Promise<{ eventTitle: string; startTime: Date } | null>`

**注記:** 当初 `getEventRegistrationDetailsForEmail`（既存）を要約表示に流用する想定だったが、その関数の戻り値は `{startTime, endTime, location, capacity, confirmedCount}` のみで `event.title` を含まない（`src/shared/domain/events/registration-queries.ts:113-121` で確認済み）。claim ページはイベント名を表示する必要があるため、専用の軽量クエリを新設する。

- [ ] **Step 0: `getEventRegistrationForClaim` クエリを追加**

`src/shared/domain/events/registration-queries.ts` に追加（同ファイルの `getEventRegistrationDetailsForEmail` と同じ `prisma.eventRegistration.findFirst` パターン）:

```ts
export async function getEventRegistrationForClaim(
  registrationId: string,
): Promise<{
  readonly eventTitle: string;
  readonly startTime: Date;
} | null> {
  const registration = await prisma.eventRegistration.findFirst({
    where: { id: registrationId, event: { deletedAt: null } },
    select: {
      slot: { select: { startAt: true } },
      event: { select: { title: true } },
    },
  });
  if (!registration) return null;
  return {
    eventTitle: registration.event.title,
    startTime: registration.slot.startAt,
  };
}
```

- [ ] **Step 1: Server Action を実装**

`src/app/(public)/claim/event-registration/_actions/claim.ts`:

```ts
"use server";

import { cookies } from "next/headers";
import { verifyEventRegistrationClaimToken } from "@/shared/lib/event-registration-claim-token";
import { claimEventRegistrationForCustomer } from "@/shared/domain/events/claim-commands";
import { ensureCustomerLinked } from "@/shared/domain/customers/link";
import { getCustomerSession } from "@/shared/lib/customer-auth";
import { checkActionRateLimit } from "@/shared/lib/action-helpers";
import { formSubmitRateLimiter } from "@/shared/lib/rate-limit";
import {
  createMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { AuditAction } from "@generated/prisma/enums";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory } from "@/shared/lib/errors/server";

const EVENT_REGISTRATION_CLAIM_TOKEN_COOKIE_NAME =
  "event-registration-claim-token";

export async function claimEventRegistrationAction(): Promise<
  MutationResult<{ eventRegistrationId: string }>
> {
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return createMutationError(rateLimit.error);

  const session = await getCustomerSession();
  if (!session) return createMutationError("認証が必要です");

  const cookieStore = await cookies();
  const token = cookieStore.get(
    EVENT_REGISTRATION_CLAIM_TOKEN_COOKIE_NAME,
  )?.value;
  if (!token) {
    return createMutationError("リンクの有効期限が切れました");
  }

  const verified = verifyEventRegistrationClaimToken(token, new Date());
  if (!verified.valid) {
    return createMutationError("リンクの有効期限が切れました");
  }

  const { customer } = await ensureCustomerLinked(session.user);
  const result = await claimEventRegistrationForCustomer(
    verified.eventRegistrationId,
    customer.id,
  );
  if (!result.claimed) {
    return createMutationError(
      "この申込は既に別のアカウントに反映されているため、追加できませんでした",
    );
  }

  fireAndForget(
    createAuditLogRecord({
      userId: session.user.id,
      action: AuditAction.UPDATE,
      resource: "eventRegistration",
      resourceId: verified.eventRegistrationId,
      newValue: { customerId: customer.id },
      metadata: { claim: true },
    }),
    {
      operation: "auditEventRegistrationClaim",
      category: ErrorCategory.DATABASE,
    },
  );

  return { eventRegistrationId: verified.eventRegistrationId };
}
```

- [ ] **Step 2: 確認ボタンのクライアントコンポーネントを実装**

`src/app/(public)/claim/event-registration/_components/claim-confirm-form.tsx`（Task 7 Step 2 と同型、遷移先とaction importのみ変更）:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/public/components/design-system/button";
import { isMutationError } from "@/shared/lib/mutation-result";
import { claimEventRegistrationAction } from "../_actions/claim";

export function ClaimConfirmForm() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleConfirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await claimEventRegistrationAction();
      if (isMutationError(result)) {
        setError(result.error);
        return;
      }
      router.push("/mypage/events");
    });
  };

  return (
    <div className="space-y-4">
      {error != null && (
        <div
          className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      )}
      <Button onClick={handleConfirm} disabled={isPending}>
        {isPending ? "反映中..." : "この申込をマイページに追加する"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: ページを実装**

`src/app/(public)/claim/event-registration/page.tsx`（Task 7 Step 4 と同型。イベント側の要約取得に `getEventRegistrationDetailsForEmail` を使う）:

```tsx
import type { ReactElement } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { verifyEventRegistrationClaimToken } from "@/shared/lib/event-registration-claim-token";
import { getEventRegistrationForClaim } from "@/shared/domain/events/registration-queries";
import { getCurrentCustomerUser } from "@/shared/lib/customer-auth";
import { getTurnstileSiteKey } from "@/shared/data/turnstile";
import { getRequiredTermsByScope } from "@/shared/domain/terms/queries";
import { TermsScope } from "@/shared/lib/validations/enums/prisma-types";
import { formatSerializedDate } from "@/shared/lib/serialize";
import {
  publicQueryRateLimiter,
  getClientIpFromHeaders,
} from "@/shared/lib/rate-limit";
import { SocialLoginButtons } from "@/app/(public)/login/_components/social-login-buttons";
import { ClaimConfirmForm } from "./_components/claim-confirm-form";

const EVENT_REGISTRATION_CLAIM_TOKEN_COOKIE_NAME =
  "event-registration-claim-token";

export const metadata: Metadata = {
  title: "イベント申込をマイページに追加",
  robots: { index: false, follow: false },
};

export default async function ClaimEventRegistrationPage(): Promise<ReactElement> {
  await connection();

  const clientIp = await getClientIpFromHeaders();
  const limit = await publicQueryRateLimiter.check(clientIp);
  if (!limit.success) {
    return <InvalidView message="リクエストが多すぎます" />;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(
    EVENT_REGISTRATION_CLAIM_TOKEN_COOKIE_NAME,
  )?.value;
  if (!token) {
    return <InvalidView />;
  }

  const verified = verifyEventRegistrationClaimToken(token, new Date());
  if (!verified.valid) {
    return <InvalidView />;
  }

  const registration = await getEventRegistrationForClaim(
    verified.eventRegistrationId,
  );
  if (!registration) {
    return <InvalidView />;
  }

  const [user, turnstileSiteKey, requiredTerms] = await Promise.all([
    getCurrentCustomerUser(),
    getTurnstileSiteKey(),
    getRequiredTermsByScope(TermsScope.LOGIN_SIGNUP),
  ]);

  return (
    <Layout>
      <div className="border border-border p-4 sm:p-6">
        <Heading level={2} className="!text-xl">
          {registration.eventTitle}
        </Heading>
        <p className="mt-2 text-sm text-muted-foreground">
          開催日:{" "}
          {formatSerializedDate(registration.startTime, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {user ? (
        <ClaimConfirmForm />
      ) : (
        <Stack gap="md">
          <p className="text-sm text-muted-foreground">
            Google または LINE
            でログイン（初めての方は自動的にアカウントが作成されます）すると、この申込をマイページに追加できます。
          </p>
          <SocialLoginButtons
            requiredTerms={requiredTerms}
            turnstileSiteKey={turnstileSiteKey}
            callbackURL="/claim/event-registration"
          />
        </Stack>
      )}
    </Layout>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <PageLayout variant="form">
      <Stack gap="lg" className="mx-auto max-w-2xl">
        <Heading level={1}>イベント申込をマイページに追加</Heading>
        {children}
      </Stack>
    </PageLayout>
  );
}

function InvalidView({
  message = "リンクの有効期限が切れました",
}: {
  message?: string;
} = {}): ReactElement {
  return (
    <Layout>
      <div className="border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-base font-medium text-foreground">{message}</p>
      </div>
    </Layout>
  );
}
```

- [ ] **Step 4: 型チェック**

Run: `bun run type-check`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add "src/app/(public)/claim/event-registration" src/shared/domain/events/registration-queries.ts
git commit -m "feat(events): add /claim/event-registration page for guest-to-mypage linking"
```

---

### Task 9: Phase 1 検証ゲート

- [ ] **Step 1: 全体検証**

Run: `bun run validate && bun run test:unit && bun run test:integration`
Expected: すべて exit 0

- [ ] **Step 2: build 検証**

Run: `bun run build`
Expected: `/claim/reservation` と `/claim/event-registration` が ƒ（動的）として表示される（静的シェル ◐ になっていないか route 表で確認）

---

## Phase 2: UI導線（フォーム事前ヒント + 完了ページCTA）

### Task 10: 予約フォームの事前ログインヒント

**Files:**

- Modify: `src/app/(public)/_components/ReservationFormSection.tsx:87,144-155`
- Modify: `src/app/(public)/reservation/_components/reservation-form.tsx`（`ReservationFormProps` に `isLoggedIn` 追加、`CustomerStep` へ引き渡し）
- Modify: `src/app/(public)/reservation/_components/customer-step.tsx:39-67,102-104`

- [ ] **Step 1: `ReservationFormSection.tsx` で `isLoggedIn` を計算し引き渡す**

`:87` の直後に追加:

```ts
const isLoggedIn = user != null;
```

`:144-155` の `<ReservationForm ... />` に `isLoggedIn={isLoggedIn}` を追加。

- [ ] **Step 2: `reservation-form.tsx` の props に追加し `CustomerStep` へ渡す**

`ReservationFormProps` interface に追加:

```ts
  readonly isLoggedIn: boolean;
```

コンポーネント引数の分割代入に `isLoggedIn` を追加し、`<CustomerStep ... />` 呼び出しに `isLoggedIn={isLoggedIn}` を追加する（呼び出し箇所は Step 3 の作業時に実ファイルを検索して特定する: `Grep "CustomerStep" reservation-form.tsx`）。

- [ ] **Step 3: `customer-step.tsx` にヒントを追加**

`CustomerStepProps` interface(`:39-67`)に追加:

```ts
  readonly isLoggedIn: boolean;
```

関数引数の分割代入に `isLoggedIn` を追加。JSX の `<div onFocus={scrollFocusedInput}>` 直後、`<BookingSummary .../>` の**前**に追加(`:102-104` 付近):

```tsx
{
  !isLoggedIn && (
    <p className="mb-6 text-sm text-muted-foreground">
      ご登録済みの方は
      <a
        href="/login?redirect=/reservation"
        className="underline underline-offset-4 hover:text-foreground"
      >
        ログイン
      </a>
      すると入力が省略されます。
    </p>
  );
}
```

- [ ] **Step 4: 型チェック**

Run: `bun run type-check`
Expected: 0 errors

- [ ] **Step 5: dev server で目視確認**

`bun run dev` 起動中に `/reservation` を未ログイン状態でアクセスし、Step3ヒントの表示・ログインリンクの遷移先を確認する。ログイン状態(E2Eログインバイパス等)ではヒントが出ないことも確認する。

- [ ] **Step 6: Commit**

```bash
git add "src/app/(public)/_components/ReservationFormSection.tsx" "src/app/(public)/reservation/_components/reservation-form.tsx" "src/app/(public)/reservation/_components/customer-step.tsx"
git commit -m "feat(reservations): add non-blocking login hint for guest checkout"
```

---

### Task 11: イベント参加フォームの事前ログインヒント + 完了メッセージ調整

**Files:**

- Modify: `src/app/(public)/events/[slug]/page.tsx`
- Modify: `src/app/(public)/events/[slug]/_components/event-registration-form.tsx`

- [ ] **Step 1: `page.tsx` で `isLoggedIn` を取得し渡す**

import 追加:

```ts
import { getCurrentCustomerUser } from "@/shared/lib/customer-auth";
```

`Promise.all` (`:101-105`) に追加:

```ts
const [slotInventory, turnstileSiteKey, requiredTerms, user] =
  await Promise.all([
    getSlotRegistrationCounts(event.id),
    getTurnstileSiteKey(),
    getRequiredTermsByScope(TermsScope.EVENT_REGISTRATION),
    getCurrentCustomerUser(),
  ]);
```

`<EventRegistrationForm .../>` (`:276-293`) に `isLoggedIn={user != null}` と `slug={slug}` を追加（`slug` は同ファイル `:94` `const { slug } = await params;` で既に取得済みの変数をそのまま渡す）。

- [ ] **Step 2: `EventRegistrationForm` の props とヒント表示を追加**

`EventRegistrationFormProps`(`:41-48`)に追加:

```ts
  readonly isLoggedIn: boolean;
  readonly slug: string;
```

関数引数(`:50-57`)に `isLoggedIn` と `slug` を追加。JSX (`:164` の `<section>` 開始直後)に追加:

```tsx
{
  !isLoggedIn && (
    <p className="text-sm text-muted-foreground">
      ご登録済みの方は
      <a
        href={`/login?redirect=/events/${slug}`}
        className="underline underline-offset-4 hover:text-foreground"
      >
        ログイン
      </a>
      すると入力が省略されます。
    </p>
  );
}
```

- [ ] **Step 3: 完了メッセージにメール誘導の一文を追加（クリック可能なボタンは置かない、理由は Task 15 コメント参照）**

`event-registration-form.tsx:131-146` の `submitted` 分岐を編集:

```tsx
if (submitted) {
  return (
    <div className="border border-accent/30 bg-surface px-8 py-12 text-center">
      <IconCircleCheck className="mx-auto h-10 w-10 text-accent" aria-hidden />
      <Heading level={3} className="mt-4">
        お申し込みを受け付けました
      </Heading>
      <p className="mt-3 text-muted-foreground">
        確認メールをお送りしましたのでご確認ください。
      </p>
      {!isLoggedIn && (
        <p className="mt-2 text-sm text-muted-foreground">
          マイページに追加したい方は、確認メール内のリンクからどうぞ。
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 型チェック**

Run: `bun run type-check`
Expected: 0 errors

- [ ] **Step 5: dev server で目視確認**

`/events/[slug]` を未ログインで開き、ヒント表示・申込後の完了メッセージ文言を確認する。

- [ ] **Step 6: Commit**

```bash
git add "src/app/(public)/events/[slug]/page.tsx" "src/app/(public)/events/[slug]/_components/event-registration-form.tsx"
git commit -m "feat(events): add non-blocking login hint and mypage-claim pointer to guest flow"
```

---

### Task 12: 予約完了ページの claim CTA

**Files:**

- Modify: `src/app/(public)/reservation/complete/page.tsx`

**理由(重要):** claim CTA は Next.js の `<Link>` ではなく素の `<a>` で実装する。`<Link>` は viewport 内でホバー/表示時に `prefetch` により GET リクエストを先行発行しうるが、`/claim/reservation` への訪問自体は読み取り専用(Task 7 で副作用を持たない設計にした)なので実害は無い — ただし `/claim/reservation` 自体が `?token=` 付きではなく素のトークン無しリンクなので、そもそも prefetch されても cookie 起因の副作用は発生しない。**それでも明示的に `<a>` を使う**: 将来 `/claim/reservation` に副作用が追加された場合の事故を予防する規約として、claim 系リンクは常に `<a>` を用いる。

- [ ] **Step 1: `createReservationClaimToken` を import し、`NextSteps` にゲスト向けCTAを追加**

`reservation/complete/page.tsx` の import に追加:

```ts
import { createReservationClaimToken } from "@/shared/lib/reservation-claim-token";
```

`ReservationCompletePage` 関数内、`NextSteps` を呼ぶ直前(`:131` 手前)に追加:

```ts
const claimUrl =
  reservation && !isLoggedIn
    ? `/claim/reservation?token=${createReservationClaimToken(reservation.id)}`
    : null;
```

`<NextSteps isLoggedIn={isLoggedIn} isPending={...} />` 呼び出しに `claimUrl={claimUrl}` を追加。

- [ ] **Step 2: `NextSteps` コンポーネントに CTA を追加**

`NextSteps` 関数シグネチャ(`:169-175`)を編集:

```ts
function NextSteps({
  isLoggedIn,
  isPending,
  claimUrl,
}: {
  readonly isLoggedIn: boolean;
  readonly isPending: boolean;
  readonly claimUrl: string | null;
}) {
```

JSX 内、ゲスト向け `<li>`(`:197-201`)の直後に追加:

```tsx
{
  claimUrl && (
    <li>
      <a
        href={claimUrl}
        className="underline underline-offset-4 hover:text-foreground"
      >
        Google/LINEでこの予約をマイページに追加する
      </a>
    </li>
  );
}
```

- [ ] **Step 3: 型チェック**

Run: `bun run type-check`
Expected: 0 errors

- [ ] **Step 4: dev server で目視確認**

ゲストとして予約を完了し `/reservation/complete?token=...` でCTAが表示されること、クリックで `/claim/reservation?token=...` に正しく遷移することを確認する。

- [ ] **Step 5: Commit**

```bash
git add "src/app/(public)/reservation/complete/page.tsx"
git commit -m "feat(reservations): add mypage-claim CTA to guest completion page"
```

---

### Task 13: Phase 2 検証ゲート

- [ ] **Step 1: 全体検証**

Run: `bun run validate`
Expected: exit 0

- [ ] **Step 2: E2E スモーク**

Run: `bunx playwright test --project=chromium-smoke`
Expected: 既存スモークが regression なく通る（フォーム変更が既存の予約/イベント申込 E2E を壊していないことを確認）

---

## Phase 3: メール導線

### Task 14: 予約確認メール + リマインダーメールに claim CTA を追加

**Files:**

- Modify: `src/shared/emails/reservation-confirmation.tsx`
- Modify: `src/shared/emails/reservation-confirmation.fixture.ts`
- Modify: `src/shared/emails/reservation-reminder.tsx`（`claimUrl` プロパティ + セクション追加、Step 4 参照）
- Modify: `src/shared/emails/reservation-reminder.fixture.ts`
- Modify: `src/shared/lib/email/reservation-emails.ts`（`sendReservationConfirmationEmail` と `sendReservationReminderEmail`）

- [ ] **Step 1: `ReservationConfirmationEmail` に `claimUrl` プロパティを追加**

`reservation-confirmation.tsx` の `Props`(`:19-36`)に追加:

```ts
  /** ゲスト向け: マイページに予約を追加する claim リンク（会員は表示しない） */
  claimUrl?: string;
```

分割代入(`:38-52`)に `claimUrl` を追加。`memberReservationUrl` ブロック(`:96-124`)の直後に追加:

```tsx
{
  claimUrl && (
    <Section
      style={{
        backgroundColor: SECTION_VARIANT_STYLES.info.background,
        borderRadius: "8px",
        padding: "16px 20px",
        margin: "24px 0",
      }}
    >
      <Text
        style={{
          fontSize: "14px",
          color: COLOR.textMuted,
          marginBottom: "8px",
        }}
      >
        Google または LINE でログインすると、この予約をマイページに追加して
        まとめて管理できます。
      </Text>
      <Text style={{ fontSize: "14px", lineHeight: "24px" }}>
        <Link
          href={claimUrl}
          style={{ color: COLOR.link, textDecoration: "underline" }}
        >
          マイページに追加する
        </Link>
      </Text>
    </Section>
  );
}
```

- [ ] **Step 2: fixture を更新**

`reservation-confirmation.fixture.ts` を開き、既存の `memberReservationUrl` fixture値と同じ形式で `claimUrl: "https://example.com/claim/reservation?token=preview-token"` を追加する（実ファイルの既存キー命名パターンに合わせる）。

- [ ] **Step 3: `sendReservationConfirmationEmail` に claimUrl 生成を追加**

`src/shared/lib/email/reservation-emails.ts` の import に追加:

```ts
import { createReservationClaimToken } from "@/shared/lib/reservation-claim-token";
```

`memberReservationUrl` 計算(`:137-140` 相当、`sendReservationConfirmationEmail` 内)の直後に追加:

```ts
const claimUrl = data.userId
  ? undefined
  : `${appUrl}/claim/reservation?token=${createReservationClaimToken(data.reservationId)}`;
```

`ReservationConfirmationEmail(...)` 呼び出しの props オブジェクトに `claimUrl` を追加。

- [ ] **Step 4: `reservation-reminder.tsx` に同じ `claimUrl` プロパティを追加**

`reservation-reminder.tsx` の `Props`(`:20-34`)に追加:

```ts
  /** ゲスト向け: マイページに予約を追加する claim リンク（会員は表示しない） */
  claimUrl?: string;
```

分割代入(`:36-47`)に `claimUrl` を追加。`memberReservationUrl` ブロック(`:104-131`)の直後に追加:

```tsx
{
  claimUrl && (
    <Section
      style={{
        backgroundColor: info.background,
        borderRadius: "8px",
        padding: "16px 20px",
        margin: "24px 0",
      }}
    >
      <Text
        style={{
          fontSize: "14px",
          color: COLOR.textMuted,
          marginBottom: "8px",
        }}
      >
        Google または LINE でログインすると、この予約をマイページに追加して
        まとめて管理できます。
      </Text>
      <Text style={{ fontSize: "14px", lineHeight: "24px" }}>
        <Link
          href={claimUrl}
          style={{ color: COLOR.link, textDecoration: "underline" }}
        >
          マイページに追加する
        </Link>
      </Text>
    </Section>
  );
}
```

（`info` 変数は同ファイル `:54` `const info = SECTION_VARIANT_STYLES.info;` で既に定義済みのものをそのまま使う）

- [ ] **Step 5: `sendReservationReminderEmail` に claimUrl 生成を追加**

`reminder-emails.ts` の `memberReservationUrl` 計算(`:55-57`)の直後に追加:

```ts
const claimUrl = data.userId
  ? undefined
  : `${appUrl}/claim/reservation?token=${createReservationClaimToken(data.reservationId)}`;
```

import に `createReservationClaimToken` を追加し、`ReservationReminderEmail(...)` 呼び出しに `claimUrl` を渡す。

- [ ] **Step 6: メールプレビューで目視確認**

Run: `bun run email:dev`
確認: `reservation-confirmation` と `reservation-reminder` のプレビューで claim セクションが表示されること。

- [ ] **Step 7: 型チェック + unit テスト**

Run: `bun run type-check && bun scripts/run-tests.ts __tests__/unit/shared/lib/email`
Expected: 0 errors, PASS（既存メール関連 unit テストに regression が無いこと）

- [ ] **Step 8: Commit**

```bash
git add src/shared/emails/reservation-confirmation.tsx src/shared/emails/reservation-confirmation.fixture.ts src/shared/emails/reservation-reminder.tsx src/shared/emails/reservation-reminder.fixture.ts src/shared/lib/email/reservation-emails.ts src/shared/lib/email/reminder-emails.ts
git commit -m "feat(reservations): add mypage-claim CTA to confirmation and reminder emails"
```

---

### Task 15: イベント参加確認メールに claim CTA を追加

イベント参加はリマインダーメール自体が存在しない（既存テンプレート5種に含まれない）ため、確認メール(`event-registration-confirmation`)のみが対象。完了ページ側(Task 11)ではクリック可能なリンクを置かず「確認メールからどうぞ」という文言に留めた理由はここにある — イベント申込フォームは client component の conform 送信結果(`{ok: true, successMessage?: string}`)経由でしか成功情報を受け取れず、共有インフラの `executeConformMutation`/`ConformHandlerResult` 契約を汎用フィールド追加で拡張するのは他の全 conform action に影響する変更になり、この機能単体のために touch するには不釣り合いに大きい。確認メールなら `result.registration.id` がサーバー側に既にあるため追加の配線なしで claim リンクを発行できる。

**Files:**

- Modify: `src/shared/emails/event-registration-confirmation.tsx`
- Modify: `src/shared/emails/event-registration-confirmation.fixture.ts`
- Modify: `src/shared/lib/email/event-emails.ts`（`EventRegistrationConfirmationData` 型 + `sendEventRegistrationConfirmation`）
- Modify: `src/app/(public)/_shared/actions/event-registration.ts`（`sendEventRegistrationConfirmation` 呼び出しに `customerId` を渡す）

- [ ] **Step 1: `EventRegistrationConfirmationEmail` に `claimUrl` プロパティを追加**

`event-registration-confirmation.tsx` の `Props`(`:16-27`)に追加:

```ts
  /** ゲスト向け: マイページに申込を追加する claim リンク（会員は表示しない） */
  claimUrl?: string;
```

分割代入(`:29-40`)に追加。import に `Link` を追加(現状 `Hr, Section, Text` のみ):

```ts
import { Hr, Link, Section, Text } from "@react-email/components";
```

`addToCalendarLinks` ブロック(`:80`)の直後に追加:

```tsx
{
  claimUrl && (
    <Section
      style={{
        backgroundColor: "#eff6ff",
        borderRadius: "8px",
        padding: "16px 20px",
        margin: "24px 0",
      }}
    >
      <Text style={{ fontSize: "14px", color: "#6b7280", marginBottom: "8px" }}>
        Google または LINE でログインすると、この申込をマイページに追加して
        まとめて管理できます。
      </Text>
      <Text style={{ fontSize: "14px", lineHeight: "24px" }}>
        <Link
          href={claimUrl}
          style={{ color: "#2563eb", textDecoration: "underline" }}
        >
          マイページに追加する
        </Link>
      </Text>
    </Section>
  );
}
```

（`backgroundColor`/`color` の値は実装時に `_shared/styles.ts` の `SECTION_VARIANT_STYLES.info` / `COLOR` を import して使う — `reservation-confirmation.tsx` の Step 1 と同じトークンに揃える。上記16進値は仮値であり、実装時は必ず `SECTION_VARIANT_STYLES.info.background` / `COLOR.textMuted` / `COLOR.link` に置き換える。）

- [ ] **Step 2: fixture を更新**

`event-registration-confirmation.fixture.ts` に `claimUrl: "https://example.com/claim/event-registration?token=preview-token"` を追加。

- [ ] **Step 3: `EventRegistrationConfirmationData` 型に `customerId` を追加**

`event-emails.ts` の型(`:50-61`)に追加:

```ts
// customerId が非null（会員）の場合は claimUrl を生成しない
customerId: string | null;
```

- [ ] **Step 4: `sendEventRegistrationConfirmation` で claimUrl を生成**

import に追加:

```ts
import { createEventRegistrationClaimToken } from "@/shared/lib/event-registration-claim-token";
```

関数内、`icsDownloadUrl` 計算(`:103`)の付近に追加:

```ts
const claimUrl = data.customerId
  ? undefined
  : `${appUrl}/claim/event-registration?token=${createEventRegistrationClaimToken(data.registrationId)}`;
```

`EventRegistrationConfirmationEmail({...})` 呼び出しの props に `claimUrl` を追加。

- [ ] **Step 5: 呼び出し元 (`event-registration.ts`) から `customerId` を渡す**

`src/app/(public)/_shared/actions/event-registration.ts` の `sendEventRegistrationConfirmation({...})` 呼び出し(`:132-142`)に追加:

```ts
                customerId,
```

（`customerId` は同ファイル `:84` で既に let 変数として定義済み — 追加の配線は不要、そのまま渡すだけ）

- [ ] **Step 6: メールプレビューで目視確認**

Run: `bun run email:dev`
確認: `event-registration-confirmation` のプレビューで claim セクションが表示されること。

- [ ] **Step 7: 型チェック**

Run: `bun run type-check`
Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add src/shared/emails/event-registration-confirmation.tsx src/shared/emails/event-registration-confirmation.fixture.ts src/shared/lib/email/event-emails.ts "src/app/(public)/_shared/actions/event-registration.ts"
git commit -m "feat(events): add mypage-claim CTA to registration confirmation email"
```

---

### Task 16: Phase 3 最終検証ゲート

- [ ] **Step 1: 全体検証**

Run: `bun run validate && bun run test:unit && bun run test:integration`
Expected: すべて exit 0

- [ ] **Step 2: build 検証**

Run: `bun run build`
Expected: 成功、route 表で新規ルートがすべて ƒ

- [ ] **Step 3: E2E フルスモーク**

Run: `bunx playwright test --project=chromium-smoke`
Expected: PASS

---

## Self-Review（実行前チェック — 完了済み）

**Spec coverage:** design spec (`docs/superpowers/specs/2026-07-08-guest-mypage-claim-design.md`) の各節との対応:

- Claimトークン → Task 1, 2
- Claim実行フロー(compare-and-swap) → Task 4, 5
- UI設置(a/b/c 3箇所) → Task 10/11(a), Task 12(b・予約のみ、イベントはTask 11で文言のみに変更 — 理由はTask 15冒頭参照), Task 14/15(c)
- ログアウト見過ごし対策(UI差別化なし) → Task 7/8 のページが新規/既存で分岐しない設計
- AuditLog記録 → Task 7/8 の action 内
- データモデル非対称性の維持(claim時遅延生成) → Task 5 で `customerId: null` ガードのみ、事前生成なし
- proxy.ts token転写 → Task 3（design spec には無かった追加検証事項。既存 `cancel-token` 転写パターンとの整合のため実装計画時に発見・追加）

**Placeholder scan:** 初稿では Task 8（`getEventRegistrationDetailsForEmail` 流用を想定）・Task 11（`slug` 未配線のまま「実装時に調整」と記載）・Task 14（`reservation-reminder.tsx` 未読のまま「同様に追加」と記載）の3箇所に "確認が必要" 型の曖昧さが残っていた。セルフレビューで検出し、いずれも実ファイルを実際に読んで具体コードに確定済み: `getEventRegistrationDetailsForEmail` は `event.title` を返さないことが判明したため専用の `getEventRegistrationForClaim` を新設(Task 8 Step 0)、`slug` は `page.tsx:94` の既存変数をそのまま渡す形で確定(Task 11 Step 1-2)、`reservation-reminder.tsx` は実ファイルを読んで `memberReservationUrl` ブロック直後への挿入コードを確定(Task 14 Step 4)。残る「TBD」「実装時に確認」等の未解決プレースホルダーは無い。

**Type consistency:** `claimReservationForCustomer(reservationId, toCustomerId): Promise<{claimed: boolean}>` / `claimEventRegistrationForCustomer(eventRegistrationId, toCustomerId): Promise<{claimed: boolean}>` の名前・シグネチャは Task 4/5(定義)・Task 7/8(使用)で一致。`verifyReservationClaimToken` の戻り値 `{valid: true; reservationId: string} | {valid: false}` も Task 1/7 で一致。

---

**Plan complete and saved to `docs/superpowers/plans/2026-07-08-guest-mypage-claim-linking.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - フレッシュな subagent を各 Task ごとに起動し、Task間でレビューしながら高速に反復する

**2. Inline Execution** - このセッション内で Task を順に実行し、Phase ごとにチェックポイントを置く

**どちらの方式で進めますか？**
