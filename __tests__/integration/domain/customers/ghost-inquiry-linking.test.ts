/**
 * 管理者が外した問い合わせの紐づけが、顧客の再ログインで復帰しないことの検証。
 *
 * == なぜ主張が反転したのか ==
 *
 * このファイルは元々、`ensureCustomerLinked` が `customerId: null` の Inquiry を
 * 同一 email の Customer へ backfill する契約（INQ-MP-01）を固定していた。
 * その前提は「ゲスト送信の Inquiry は `customerId: null` で保存される」だった。
 *
 * **その前提はもう成立しない。** `createInquiryCommand` は
 * `resolveOrCreateGuestInquiryCustomer`（戻り値 `Promise<string>`）で必ず
 * customer を解決するので、公開フォーム経由の問い合わせは常に `customerId` を持つ。
 * 現在 `customerId: null` を作る書き込み経路は
 * **管理者の「顧客の紐づけを解除」操作だけ**（`updateInquiryCustomer(id, null)`）。
 *
 * つまり backfill が実効していたのは「管理者の解除を打ち消すこと」だけだった。
 * 対象の顧客が次にログインした瞬間、本文・返信スレッド・添付が黙ってマイページへ
 * 復帰し、管理者には通知も履歴も残らない（監査 F-117）。
 *
 * そこで backfill を削除し、**解除が持続すること**をここで固定する。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行。`bun run test:integration` が
 * docker-compose の test-db 既定値を注入する。
 * scripts/test-db-runner-env.ts の SERIAL_DB_TESTS に登録済 (drift gate)。
 */

import { describe, test, expect, beforeAll, afterAll, mock } from "bun:test";
import { InquiryStatus } from "@generated/prisma/enums";
import { installEmailDispatchMock } from "../../../support/email-dispatch-mock";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

// welcome メールは fire-and-forget で走る。Next の request scope に依存させない。
mock.module("next/cache", () => ({
  cacheLife: () => {},
  cacheTag: () => {},
  revalidateTag: () => {},
  updateTag: () => {},
}));
installEmailDispatchMock({
  sendWelcomeEmail: mock(() => Promise.resolve()),
});

type PrismaModule = typeof import("@/shared/db/prisma");
type LinkModule = typeof import("@/shared/domain/customers/link");

let prisma: PrismaModule["prisma"];
let ensureCustomerLinked: LinkModule["ensureCustomerLinked"];

function generateTestReceiptNumber(): string {
  const raw = crypto
    .randomUUID()
    .replaceAll("-", "")
    .substring(0, 8)
    .toUpperCase();
  return `INQ-${raw}`;
}

/** 管理者が紐づけを解除した状態（= 現在 `customerId: null` を作る唯一の経路）。 */
async function createDetachedInquiry(email: string): Promise<string> {
  const inquiry = await prisma.inquiry.create({
    data: {
      receiptNumber: generateTestReceiptNumber(),
      name: "ゲスト太郎",
      email,
      subject: "テスト",
      message: "紐づけ解除テスト",
      status: InquiryStatus.NEW,
      // 管理者が `updateInquiryCustomer(id, null)` を実行した後の状態。
    },
    select: { id: true },
  });
  return inquiry.id;
}

async function createUser(email: string): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email,
      name: "テスト太郎",
      emailVerified: false,
      role: "CUSTOMER",
    },
    select: { id: true },
  });
  return user.id;
}

async function cleanup(email: string, userId: string): Promise<void> {
  await prisma.inquiry.deleteMany({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  await prisma.customer.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}

describeMaybe("ensureCustomerLinked は解除された紐づけを復活させない", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ ensureCustomerLinked } = await import("@/shared/domain/customers/link"));
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("新規 Customer 作成時に、解除済み Inquiry を拾わない", async () => {
    const suffix = crypto.randomUUID();
    const email = `detached-${suffix}@example.com`;
    const inquiryId = await createDetachedInquiry(email);
    const userId = await createUser(email);

    try {
      const result = await ensureCustomerLinked({
        id: userId,
        email,
        name: "テスト太郎",
      });

      expect(result.isNew).toBe(true);

      const inquiry = await prisma.inquiry.findUnique({
        where: { id: inquiryId },
        select: { customerId: true },
      });
      // 復活すると、管理者が意図的に外した本文・返信・添付がマイページへ戻る。
      expect(inquiry?.customerId).toBeNull();
    } finally {
      await cleanup(email, userId);
    }
  });

  test("既に紐づけ済みの顧客が再ログインしても復活しない", async () => {
    const suffix = crypto.randomUUID();
    const email = `detached-relogin-${suffix}@example.com`;
    const userId = await createUser(email);

    // 1 回目のログインで Customer を作る。
    const first = await ensureCustomerLinked({
      id: userId,
      email,
      name: "テスト太郎",
    });
    const inquiryId = await createDetachedInquiry(email);

    try {
      // 2 回目以降のログイン（既紐付けパス）。旧実装はここでも backfill していた。
      const second = await ensureCustomerLinked({
        id: userId,
        email,
        name: "テスト太郎",
      });
      expect(second.isNew).toBe(false);
      expect(second.customer.id).toBe(first.customer.id);

      const inquiry = await prisma.inquiry.findUnique({
        where: { id: inquiryId },
        select: { customerId: true },
      });
      expect(inquiry?.customerId).toBeNull();
    } finally {
      await cleanup(email, userId);
    }
  });

  test("大文字小文字が違っても復活しない", async () => {
    const suffix = crypto.randomUUID();
    const inquiryEmail = `Detached-Case-${suffix}@Example.com`;
    const oauthEmail = `detached-case-${suffix}@example.com`;
    const inquiryId = await createDetachedInquiry(inquiryEmail);
    const userId = await createUser(oauthEmail);

    try {
      await ensureCustomerLinked({
        id: userId,
        email: oauthEmail,
        name: "テスト太郎",
      });

      const inquiry = await prisma.inquiry.findUnique({
        where: { id: inquiryId },
        select: { customerId: true },
      });
      expect(inquiry?.customerId).toBeNull();
    } finally {
      await cleanup(inquiryEmail, userId);
      await cleanup(oauthEmail, userId);
    }
  });
});
