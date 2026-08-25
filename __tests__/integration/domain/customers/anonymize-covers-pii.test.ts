/**
 * 匿名化したら、`/// @pii erase-on-anonymize` の TOKEN が **DB のどこにも
 * 残っていない**ことを実 DB で確かめる。
 *
 * ## 分母は `/// @pii`、allowlist ではない
 *
 * 列や表の一覧をテストに書けば、その一覧が drift する。分母は
 * `schema.prisma` の `/// @pii-model` / `/// @pii`（`readPiiManifest()`）。
 * `ERASE_TABLES` は `erase-on-anonymize` 列の表、`KEEP_TABLES` は holds のうち
 * erase 列を持たない表。fixture が TOKEN を全 erase 表に書いたあと
 * `to_jsonb(row)::text` で **全 public 表を走査**する。新しい holds 表に
 * erase 列を足して匿名化を配線し忘れたら、その表名が出て落ちる。
 *
 * ## append-only は `pg_trigger` から導く
 *
 * `KEEP_TABLES` のうち本当に書き換え不能なものは、BEFORE UPDATE trigger を
 * カタログから読む。allowlist は置かない。`audit_logs` の JSON PII は C-PR4。
 *
 * ## 生き残ってよいもの（KEPT）
 *
 * TOKEN（消えなければならない側）とは別トークンにする。混ぜると片方の退行が
 * もう片方の除外に吸収される。
 *
 * - `space_reviews` の本文（`title` / `comment`）。退会で低評価を消せる経路を
 *   作らない。著者表示は `anonymizedAt` を見て「匿名」に切り替わる
 * - `receipts.recipient_name`。適格請求書の記載事項で保存義務がある
 *
 * **`terms_agreements` は fixture で作れない。** append-only trigger のせいで
 * `afterAll` が消せず、共有 test-db に積み上がる。TOKEN は書かないので、
 * 匿名化後の走査は空配列になる（古い `terms_agreements` 除外は削除した）。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行（`bun run test:integration` が docker-compose の
 * test-db 既定値を注入する）。gateway は import 時の `process.env.DATABASE_URL` を
 * 読むため動的 import より前に上書きする。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { readPiiManifest } from "../../../support/pii-manifest";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type LifecycleModule =
  typeof import("@/shared/domain/customers/customer-lifecycle-commands");

let prisma: PrismaModule["prisma"];
let anonymizeCustomerCommand: LifecycleModule["anonymizeCustomerCommand"];

const manifest = readPiiManifest();

/** `erase-on-anonymize` 列を持つ表。fixture が TOKEN を全部に書く。 */
const ERASE_TABLES = [
  ...new Set(
    manifest.columns
      .filter((column) => column.strategy === "erase-on-anonymize")
      .map((column) => column.table),
  ),
].sort();

const eraseTableSet = new Set(ERASE_TABLES);

/** holds のうち erase 列が無い表（keep のみ / `@pii` 列なし）。 */
const KEEP_TABLES = manifest.models
  .filter((model) => model.mode === "holds" && !eraseTableSet.has(model.table))
  .map((model) => model.table)
  .sort();

/**
 * 走査で拾えるよう、他のどの行にも現れない綴りにする。
 *
 * 電話番号の列が最も狭い（`VarChar(20)` 系）ので、そこに収まる長さにする。
 * 溢れると `LengthMismatch` で fixture 作成ごと落ちる。
 */
const TOKEN = `pii${crypto.randomUUID().replaceAll("-", "").slice(0, 13)}`;

/** 匿名化後も残ると決めたものに入れる。消えたら落とす。 */
const KEPT = `keep${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;

const created = {
  customerId: "",
  mergeTargetCustomerId: "",
  userId: "",
  sessionId: "",
  reservationId: "",
  receiptId: "",
  inquiryId: "",
  inquiryReplyId: "",
  inquiryAttachmentId: "",
  registrationId: "",
  reviewId: "",
  eventId: "",
  spaceId: "",
  locationId: "",
  categoryId: "",
  verificationId: "",
};

async function listPublicBaseTables(): Promise<string[]> {
  const tables = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name::text AS table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  return tables.map((row) => row.table_name);
}

async function loadAppendOnlyTables(): Promise<Set<string>> {
  const rows = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT c.relname::text AS table_name
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal
      AND (t.tgtype & 2) <> 0 AND (t.tgtype & 8) <> 0
    GROUP BY c.relname
  `;
  return new Set(rows.map((row) => row.table_name));
}

/** そのトークンを含む行を持つテーブル名（`to_jsonb` で全列を一度に見る）。 */
async function tablesStillHolding(token: string): Promise<string[]> {
  const tables = await listPublicBaseTables();
  const hits: string[] = [];
  for (const table of tables) {
    // 識別子は information_schema 由来なので注入経路は無いが、値は必ず束縛で渡す。
    const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM "${table}" t WHERE to_jsonb(t)::text LIKE $1`,
      `%${token}%`,
    );
    if ((rows[0]?.n ?? 0n) > 0n) hits.push(table);
  }
  return hits.sort();
}

describeMaybe("匿名化は参照先の PII も消す", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ anonymizeCustomerCommand } =
      await import("@/shared/domain/customers/customer-lifecycle-commands"));

    const suffix = crypto.randomUUID();
    const location = await prisma.location.create({
      data: {
        slug: `anon-loc-${suffix}`,
        name: `Anon Loc ${suffix}`,
        address: "東京都テスト区1-2-3",
        imageUrl: "https://example.com/l.jpg",
        isActive: false,
      },
      select: { id: true },
    });
    created.locationId = location.id;

    const space = await prisma.space.create({
      data: {
        slug: `anon-space-${suffix}`,
        name: `Anon Space ${suffix}`,
        descriptionJson: { type: "doc" },
        descriptionHtml: "<p>t</p>",
        descriptionPlainText: "t",
        capacity: 4,
        hourlyPrice: 1000,
        mainImageUrl: "https://example.com/s.jpg",
        locationId: created.locationId,
        isPublished: false,
        isActive: false,
      },
      select: { id: true },
    });
    created.spaceId = space.id;

    // Customer.userId は @unique。User を先に作り、それから紐づける。
    const user = await prisma.user.create({
      data: {
        email: `${TOKEN}@example.com`,
        name: `名${TOKEN}`,
        emailVerified: false,
        role: "CUSTOMER",
      },
      select: { id: true },
    });
    created.userId = user.id;

    const session = await prisma.session.create({
      data: {
        token: `sess-${suffix}`,
        userId: user.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        ipAddress: TOKEN,
        userAgent: `ua-${TOKEN}`,
      },
      select: { id: true },
    });
    created.sessionId = session.id;

    const customer = await prisma.customer.create({
      data: {
        email: `${TOKEN}@example.com`,
        emailCanonical: `${TOKEN}@example.com`,
        lastName: `姓${TOKEN}`,
        firstName: `名${TOKEN}`,
        phoneNumber: TOKEN,
        userId: user.id,
      },
      select: { id: true },
    });
    created.customerId = customer.id;

    const start = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const reservation = await prisma.reservation.create({
      data: {
        spaceId: created.spaceId,
        customerId: created.customerId,
        startTime: start,
        endTime: new Date(start.getTime() + 60 * 60 * 1000),
        basePrice: 1000,
        totalPrice: 1000,
        taxAmount: 100,
        totalPriceWithTax: 1100,
        taxRate: 10,
        taxRateType: "STANDARD",
        rateBreakdownJson: {},
        // 公開の予約作成はログイン顧客でもここへ実名・連絡先を書く。
        guestLastName: `姓${TOKEN}`,
        guestFirstName: `名${TOKEN}`,
        guestEmail: `${TOKEN}@example.com`,
        guestPhone: TOKEN,
        guestCompanyName: `社${TOKEN}`,
        // 自由記入の備考。第三者の氏名・電話が書かれる（監査 F-116）。
        notes: `備考${TOKEN}`,
      },
      select: { id: true },
    });
    created.reservationId = reservation.id;

    const receipt = await prisma.receipt.create({
      data: {
        serialNo: `9998-${suffix.replaceAll("-", "").slice(0, 6).toUpperCase()}`,
        reservationId: created.reservationId,
        recipientName: `宛名${KEPT}`,
        subject: "スペース利用料として",
        amount: 1100,
        taxAmount: 100,
        taxRate: 10,
        issuerSnapshot: { snapshotAt: new Date().toISOString() },
      },
      select: { id: true },
    });
    created.receiptId = receipt.id;

    // レビュー本文は「残すと決めた」側。TOKEN ではなく KEPT を入れる。
    const review = await prisma.spaceReview.create({
      data: {
        spaceId: created.spaceId,
        customerId: created.customerId,
        reservationId: created.reservationId,
        rating: 5,
        title: `題${KEPT}`,
        comment: `本文${KEPT}`,
      },
      select: { id: true },
    });
    created.reviewId = review.id;

    const inquiry = await prisma.inquiry.create({
      data: {
        receiptNumber: `INQ${TOKEN.slice(0, 12)}`,
        customerId: created.customerId,
        name: `姓名${TOKEN}`,
        email: `${TOKEN}@example.com`,
        phoneNumber: TOKEN,
        subject: `件名${TOKEN}`,
        message: `本文${TOKEN}`,
      },
      select: { id: true },
    });
    created.inquiryId = inquiry.id;

    const reply = await prisma.inquiryReply.create({
      data: {
        inquiryId: created.inquiryId,
        authorType: "CUSTOMER",
        authorCustomerId: created.customerId,
        body: `返信${TOKEN}`,
      },
      select: { id: true },
    });
    created.inquiryReplyId = reply.id;

    const attachment = await prisma.inquiryAttachment.create({
      data: {
        inquiryId: created.inquiryId,
        r2Key: `test/anon-pii/${suffix}/${TOKEN}.bin`,
        mimeType: "application/octet-stream",
        sizeBytes: 12,
        filename: `${TOKEN}.bin`,
        uploadedByCustomerId: created.customerId,
      },
      select: { id: true },
    });
    created.inquiryAttachmentId = attachment.id;

    const category = await prisma.eventCategory.create({
      data: {
        name: `Anon Cat ${suffix}`,
        sortOrder: 20_000_000 + Math.floor(Math.random() * 100_000_000),
      },
      select: { id: true },
    });
    created.categoryId = category.id;

    const { eventId, slotId, ticketId } = await prisma.$transaction(
      async (tx) => {
        const event = await tx.event.create({
          data: {
            title: `Anon Event ${suffix}`,
            slug: `anon-event-${suffix}`,
            descriptionJson: { type: "doc" },
            descriptionHtml: "<p>t</p>",
            descriptionPlainText: "t",
            scheduleMode: "SINGLE_OCCURRENCE",
            categoryId: created.categoryId,
          },
          select: { id: true },
        });
        const slot = await tx.eventTimeSlot.create({
          data: {
            eventId: event.id,
            startAt: start,
            endAt: new Date(start.getTime() + 60 * 60 * 1000),
            capacity: 10,
          },
          select: { id: true },
        });
        const ticket = await tx.eventTicket.create({
          data: { eventId: event.id, name: "一般", price: 0 },
          select: { id: true },
        });
        return { eventId: event.id, slotId: slot.id, ticketId: ticket.id };
      },
    );
    created.eventId = eventId;

    const registration = await prisma.eventRegistration.create({
      data: {
        eventId,
        slotId,
        ticketId,
        customerId: created.customerId,
        name: `姓名${TOKEN}`,
        email: `${TOKEN}@example.com`,
        phone: TOKEN,
        note: `備考${TOKEN}`,
        quantity: 1,
      },
      select: { id: true },
    });
    created.registrationId = registration.id;

    await prisma.pendingCustomerEmailChange.create({
      data: {
        customerId: created.customerId,
        newEmail: `${TOKEN}@example.com`,
        newEmailCanonical: `${TOKEN}@example.com`,
        tokenHash: `a${TOKEN}`.padEnd(64, "0").slice(0, 64),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const otherEmail = `merge-target-${crypto.randomUUID()}@example.com`;
    const mergeTarget = await prisma.customer.create({
      data: {
        lastName: "統合先",
        firstName: "太郎",
        email: otherEmail,
        emailCanonical: otherEmail,
      },
      select: { id: true },
    });
    created.mergeTargetCustomerId = mergeTarget.id;
    await prisma.pendingCustomerMerge.create({
      data: {
        targetCustomerId: mergeTarget.id,
        sourceCustomerId: created.customerId,
        guestEmail: `${TOKEN}@example.com`,
        tokenHash: `b${TOKEN}`.padEnd(64, "0").slice(0, 64),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const verification = await prisma.verification.create({
      data: {
        identifier: `${TOKEN}@example.com`,
        value: `value-${suffix}`,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
      select: { id: true },
    });
    created.verificationId = verification.id;
  });

  afterAll(async () => {
    await prisma.inquiryAttachment.deleteMany({
      where: { id: created.inquiryAttachmentId },
    });
    await prisma.inquiryReply.deleteMany({
      where: { id: created.inquiryReplyId },
    });
    await prisma.inquiry.deleteMany({ where: { id: created.inquiryId } });
    await prisma.receipt.deleteMany({ where: { id: created.receiptId } });
    await prisma.spaceReview.deleteMany({ where: { id: created.reviewId } });
    await prisma.eventRegistration.deleteMany({
      where: { id: created.registrationId },
    });
    await prisma.eventTicket.deleteMany({
      where: { eventId: created.eventId },
    });
    await prisma.event.deleteMany({ where: { id: created.eventId } });
    await prisma.eventCategory.deleteMany({
      where: { id: created.categoryId },
    });
    await prisma.reservation.deleteMany({
      where: { id: created.reservationId },
    });
    await prisma.session.deleteMany({ where: { id: created.sessionId } });
    await prisma.user.deleteMany({ where: { id: created.userId } });
    await prisma.space.deleteMany({ where: { id: created.spaceId } });
    await prisma.location.deleteMany({ where: { id: created.locationId } });
    await prisma.customer.deleteMany({ where: { id: created.customerId } });
    await prisma.customer.deleteMany({
      where: { id: created.mergeTargetCustomerId },
    });
    await prisma.verification.deleteMany({
      where: { id: created.verificationId },
    });
    await prisma.$disconnect();
  });

  test("匿名化の前は、manifest の erase 表に実際に TOKEN が入っている", async () => {
    const scannedTableCount = (await listPublicBaseTables()).length;
    expect(scannedTableCount).toBeGreaterThan(60);

    const appendOnly = await loadAppendOnlyTables();
    expect(KEEP_TABLES.filter((table) => appendOnly.has(table))).toEqual([
      "audit_logs",
      "terms_agreements",
    ]);

    expect(await tablesStillHolding(TOKEN)).toEqual(ERASE_TABLES);
    expect(await tablesStillHolding(KEPT)).toEqual([
      "receipts",
      "space_reviews",
    ]);
  });

  test("匿名化すると erase 表から PII が消える", async () => {
    await anonymizeCustomerCommand({
      customerId: created.customerId,
      reason: "customer-requested",
    });

    expect(await tablesStillHolding(TOKEN)).toEqual([]);
  });

  test("レビュー本文と領収書宛名は残す", async () => {
    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: created.customerId },
      select: { anonymizedAt: true },
    });
    expect(customer.anonymizedAt).not.toBeNull();

    expect(await tablesStillHolding(KEPT)).toEqual([
      "receipts",
      "space_reviews",
    ]);
  });
});
