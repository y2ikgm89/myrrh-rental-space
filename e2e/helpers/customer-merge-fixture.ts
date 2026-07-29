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

export async function guestCustomerExistsForDevEmail(): Promise<boolean> {
  const client = getE2EPrismaClient();
  const guest = await client.customer.findFirst({
    where: {
      email: DEV_CUSTOMER_EMAIL,
      userId: null,
      anonymizedAt: null,
    },
    select: { id: true },
  });
  return guest !== null;
}
