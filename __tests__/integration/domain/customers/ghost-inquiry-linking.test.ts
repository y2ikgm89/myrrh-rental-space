/**
 * INQ-MP-01 実 DB 統合テスト: ゲスト送信 (customerId: null) のお問い合わせを
 * ensureCustomerLinked が同一 email の Customer に backfill する。
 *
 * ゲストがお問い合わせを送信した後で OAuth 登録した場合、`Inquiry.customerId` は
 * null のままだったため /mypage/inquiries に表示されなかった。ensureCustomerLinked
 * が Customer 作成/リンク後に updateMany で backfill する契約を、実 DB で検証する。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行。`bun run test:integration` が
 * docker-compose の test-db 既定値を注入する。
 * scripts/test-db-runner-env.ts の SERIAL_DB_TESTS に登録済 (drift gate)。
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { InquiryStatus } from "@generated/prisma/enums";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type LinkModule = typeof import("@/shared/domain/customers/link");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];
let ensureCustomerLinked: LinkModule["ensureCustomerLinked"];

/**
 * PR #1282 で Inquiry.receiptNumber (@unique) が NOT NULL 化されたため、
 * fixture 毎に一意の "INQ-XXXXXXXX" を採番する（production の
 * generateReceiptNumberCandidate と同型式）。
 */
function generateTestReceiptNumber(): string {
  const raw = crypto
    .randomUUID()
    .replaceAll("-", "")
    .substring(0, 8)
    .toUpperCase();
  return `INQ-${raw}`;
}

async function createGuestInquiry(email: string): Promise<string> {
  const inquiry = await basePrisma.inquiry.create({
    data: {
      receiptNumber: generateTestReceiptNumber(),
      name: "ゲスト太郎",
      email,
      subject: "テスト",
      message: "ゲスト送信テスト",
      status: InquiryStatus.NEW,
      // customerId は明示的に null (ゲスト送信を再現)
    },
    select: { id: true },
  });
  return inquiry.id;
}

async function createUser(email: string): Promise<string> {
  const user = await basePrisma.user.create({
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

async function cleanupInquiries(email: string): Promise<void> {
  await basePrisma.inquiry.deleteMany({
    where: { email: { equals: email, mode: "insensitive" } },
  });
}

async function cleanupCustomer(userId: string): Promise<void> {
  await basePrisma.customer.deleteMany({ where: { userId } });
}

async function cleanupUser(userId: string): Promise<void> {
  await basePrisma.user.deleteMany({ where: { id: userId } });
}

describeMaybe("ensureCustomerLinked (INQ-MP-01)", () => {
  beforeAll(async () => {
    ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
    ({ ensureCustomerLinked } = await import("@/shared/domain/customers/link"));
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    prisma; // suppress unused (imported for parity with other integration tests)
  });

  afterAll(async () => {
    await basePrisma.$disconnect();
  });

  test("Customer 新規作成時に同一 email のゲスト Inquiry が backfill される", async () => {
    const suffix = crypto.randomUUID();
    const email = `ghost-inquiry-${suffix}@example.com`;
    const inquiryId = await createGuestInquiry(email);
    const userId = await createUser(email);

    try {
      const result = await ensureCustomerLinked({
        id: userId,
        email,
        name: "テスト太郎",
      });

      expect(result.isNew).toBe(true);
      expect(result.customer.userId).toBe(userId);

      const linked = await basePrisma.inquiry.findUnique({
        where: { id: inquiryId },
        select: { customerId: true },
      });
      expect(linked?.customerId).toBe(result.customer.id);
    } finally {
      await cleanupInquiries(email);
      await cleanupCustomer(userId);
      await cleanupUser(userId);
    }
  });

  test("大文字小文字の差異があっても backfill される (case-insensitive match)", async () => {
    const suffix = crypto.randomUUID();
    const guestEmail = `Ghost-Case-${suffix}@Example.com`;
    const oauthEmail = `ghost-case-${suffix}@example.com`;
    const inquiryId = await createGuestInquiry(guestEmail);
    const userId = await createUser(oauthEmail);

    try {
      const result = await ensureCustomerLinked({
        id: userId,
        email: oauthEmail,
        name: "テスト太郎",
      });

      const linked = await basePrisma.inquiry.findUnique({
        where: { id: inquiryId },
        select: { customerId: true },
      });
      expect(linked?.customerId).toBe(result.customer.id);
    } finally {
      await cleanupInquiries(guestEmail);
      await cleanupInquiries(oauthEmail);
      await cleanupCustomer(userId);
      await cleanupUser(userId);
    }
  });

  test("別 Customer に既に紐付いている Inquiry は絶対に上書きしない", async () => {
    const suffix = crypto.randomUUID();
    const email = `ghost-noover-${suffix}@example.com`;
    // 事前に別の Customer に紐付いた Inquiry を作る
    const otherCustomer = await basePrisma.customer.create({
      data: {
        lastName: "他人",
        firstName: "花子",
        email: `other-${suffix}@example.com`,
        emailCanonical: `other-${suffix}@example.com`,
      },
      select: { id: true },
    });
    const linkedInquiry = await basePrisma.inquiry.create({
      data: {
        receiptNumber: generateTestReceiptNumber(),
        name: "他人経由",
        email, // 同じ email
        subject: "テスト",
        message: "既紐付け Inquiry",
        status: InquiryStatus.NEW,
        customerId: otherCustomer.id, // 別 Customer に紐付け済
      },
      select: { id: true },
    });
    const userId = await createUser(email);

    try {
      const result = await ensureCustomerLinked({
        id: userId,
        email,
        name: "テスト太郎",
      });

      // 既紐付け Inquiry は otherCustomer のまま維持されているはず
      const preserved = await basePrisma.inquiry.findUnique({
        where: { id: linkedInquiry.id },
        select: { customerId: true },
      });
      expect(preserved?.customerId).toBe(otherCustomer.id);
      expect(preserved?.customerId).not.toBe(result.customer.id);
    } finally {
      await cleanupInquiries(email);
      await cleanupCustomer(userId);
      await cleanupUser(userId);
      await basePrisma.customer.deleteMany({ where: { id: otherCustomer.id } });
    }
  });

  test("既紐付け Customer への再ログイン時 (2 回目以降) でも backfill が走る", async () => {
    const suffix = crypto.randomUUID();
    const email = `ghost-relogin-${suffix}@example.com`;
    const userId = await createUser(email);

    try {
      // 1 回目のリンク (この時点では guest Inquiry なし)
      const firstResult = await ensureCustomerLinked({
        id: userId,
        email,
        name: "テスト太郎",
      });
      expect(firstResult.isNew).toBe(true);

      // 顧客がログイン後に別セッションから inquiry フォームを未ログインで送信
      // (実際にはあまりない導線だが、backfill の再エントランスを保証)
      const laterGuestInquiryId = await createGuestInquiry(email);

      // 2 回目のリンク: 既紐付けなので isNew=false だが backfill も走る
      const secondResult = await ensureCustomerLinked({
        id: userId,
        email,
        name: "テスト太郎",
      });
      expect(secondResult.isNew).toBe(false);

      const linked = await basePrisma.inquiry.findUnique({
        where: { id: laterGuestInquiryId },
        select: { customerId: true },
      });
      expect(linked?.customerId).toBe(secondResult.customer.id);
    } finally {
      await cleanupInquiries(email);
      await cleanupCustomer(userId);
      await cleanupUser(userId);
    }
  });
});
