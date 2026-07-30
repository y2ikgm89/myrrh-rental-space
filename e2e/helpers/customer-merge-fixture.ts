/**
 * Self-serve customer merge E2E helper.
 *
 * Playwright process 専用 PrismaClient で pending merge token を発行する。
 * raw token は URL 確認ページ用にのみ返し、DB には hash のみ保存する。
 */

import { createHash, randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@generated/prisma/client";

const DEV_CUSTOMER_EMAIL = "dev-customer@example.com";
const CUSTOMER_MERGE_TOKEN_TTL_MS = 60 * 60 * 1000;

let cachedClient: PrismaClient | null = null;

function getE2EPrismaClient(): PrismaClient {
  if (cachedClient) return cachedClient;
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set for customer merge E2E helper.");
  }
  cachedClient = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  return cachedClient;
}

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
