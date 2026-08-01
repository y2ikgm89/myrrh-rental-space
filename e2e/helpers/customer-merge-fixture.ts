/**
 * Self-serve customer merge E2E helper.
 *
 * Playwright process 専用 PrismaClient で pending merge token を発行する。
 * raw token は URL 確認ページ用にのみ返し、DB には hash のみ保存する。
 */

import { createHash, randomBytes } from "node:crypto";
import { getE2EPrismaClient } from "./e2e-prisma";

const DEV_CUSTOMER_EMAIL = "dev-customer@example.com";
const CUSTOMER_MERGE_TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * seed（`prisma/seed.ts` の `GUEST_MERGE_MARKER`）が guest Customer に付ける
 * 予約の marker。seed と二重定義なので seed 変更時は同時に更新する。
 */
const GUEST_MERGE_RESERVATION_MARKER = "[E2E] guest history for customer merge";

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export async function issueCustomerMergeTokenForE2E(): Promise<{
  rawToken: string;
  memberCustomerId: string;
  guestCustomerId: string;
}> {
  const client = getE2EPrismaClient();

  const member = await client.customer.findFirst({
    where: {
      email: DEV_CUSTOMER_EMAIL,
      userId: { not: null },
    },
    select: { id: true },
  });
  const guest = await client.customer.findFirst({
    where: {
      email: DEV_CUSTOMER_EMAIL,
      userId: null,
      anonymizedAt: null,
    },
    select: { id: true, email: true },
  });

  if (!member || !guest) {
    throw new Error(
      "Dev member/guest customer pair not found. Run seedDevCustomerAndReservations.",
    );
  }

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + CUSTOMER_MERGE_TOKEN_TTL_MS);
  const guestEmail = guest.email ?? DEV_CUSTOMER_EMAIL;

  await client.pendingCustomerMerge.deleteMany({
    where: { targetCustomerId: member.id, consumedAt: null },
  });
  await client.pendingCustomerMerge.create({
    data: {
      targetCustomerId: member.id,
      sourceCustomerId: guest.id,
      guestEmail,
      tokenHash,
      expiresAt,
    },
  });

  return {
    rawToken,
    memberCustomerId: member.id,
    guestCustomerId: guest.id,
  };
}

/**
 * dev customer と同じメールの「未連携ゲスト Customer」を保証する。
 *
 * この行は seed（`seedDevCustomerAndReservations`）が 1 度だけ作るが、
 * merge を実行する spec 自身がそれを **消費**する。serial describe の retry では
 * beforeAll が再実行されるため、存在チェックだけだと「自分が消したものが無い」で
 * 落ちる（run 30569714860 の "Guest customer seed missing"）。
 * seed 済みかどうかに依存せず冪等に用意することで retry 安全にする。
 */
export async function ensureGuestCustomerForDevEmail(): Promise<string> {
  const client = getE2EPrismaClient();
  const existing = await client.customer.findFirst({
    where: {
      email: DEV_CUSTOMER_EMAIL,
      userId: null,
      anonymizedAt: null,
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  // seed（prisma/seed.ts の guest merge fixture）と同じ形で作り直す。
  const created = await client.customer.create({
    data: {
      email: DEV_CUSTOMER_EMAIL,
      emailCanonical: DEV_CUSTOMER_EMAIL.trim().toLowerCase(),
      lastName: "ゲスト",
      firstName: "履歴",
      phoneNumber: "090-0000-0001",
      customerType: "PERSONAL",
      status: "REGULAR",
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * merge で消費した guest fixture を seed 状態へ戻す（復元 hook 専用）。
 *
 * `mergeCustomerCommand` は source Customer の予約・問い合わせ等を member へ
 * 付け替えたあと **source を物理削除**する（`customer-lifecycle-commands.ts`）。
 * したがって merge 後は
 *
 * - mypage の統合バナー（未リンク guest 行の存在が条件）が消える
 * - marker 予約が dev member customer の予約履歴に移る。seed の存在チェックは
 *   `{ customerId: guestCustomer.id, notes: marker }` なので、戻さないと次の seed が
 *   marker 予約をもう 1 本作り、**E2E を回すたび dev customer の予約が 1 件ずつ増える**
 *
 * の 2 つが残る。guest 行を作り直し、marker 予約をそこへ戻す。
 */
export async function restoreGuestCustomerFixture(): Promise<void> {
  const client = getE2EPrismaClient();
  const guestCustomerId = await ensureGuestCustomerForDevEmail();

  await client.reservation.updateMany({
    where: { notes: GUEST_MERGE_RESERVATION_MARKER },
    data: { customerId: guestCustomerId },
  });

  // merge が成立した run の PendingCustomerMerge は source 削除の cascade で
  // 消えるが、途中で落ちた run の未消費 token は残る。seed は 1 件も作らない。
  await client.pendingCustomerMerge.deleteMany({
    where: { guestEmail: DEV_CUSTOMER_EMAIL },
  });
}
