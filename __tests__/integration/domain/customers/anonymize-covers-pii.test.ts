/**
 * 匿名化したら、その顧客の PII が **DB のどこにも残っていない**ことを実 DB で確かめる。
 *
 * ## なぜ列を並べないのか
 *
 * `anonymizeCustomerCommand` の JSDoc は「Reservation / Receipt / Inquiry /
 * SpaceReview / EventRegistration / TermsAgreement は削除せず customerId 参照を
 * 維持する。JOIN で PII に到達しても全て redacted 値になる」と宣言していたが、
 * 実装は **Customer 自身の列と Inquiry しか触っていなかった**。
 *
 * - `Reservation.guestLastName / guestFirstName / guestEmail / guestPhone /
 *   guestCompanyName` は残っていた。公開の予約作成は**ログイン顧客でも無条件に**
 *   これらを埋めるので、退会後も JOIN 一発で実名・メール・電話に到達できた
 * - `EventRegistration.name / email / phone / note` も残っていた。`customerId` は
 *   `onDelete: SetNull` の弱い参照なので、顧客を消しても申込者の連絡先が残る
 *
 * **列の一覧を書けば、その一覧が drift する。** だから列を並べない。
 * 各項目に一意のトークンを入れて匿名化し、`to_jsonb(row)::text` で**全テーブルを
 * 走査**して、トークンが生き残っている表を列挙する。新しい表に PII を持たせて
 * 匿名化を配線し忘れたら、その表の名前が出て落ちる。
 *
 * ## 生き残ってよい表
 *
 * `terms_agreements` だけ。同意の証跡は append-only（DB trigger が UPDATE/DELETE を
 * 拒否する）で、`guestEmail` が誰の同意かを示す唯一の手がかりになる。法的保存義務が
 * redaction より優先する領域なので、**残ることを積極的に固定**する
 * （「たまたま残っている」と「残すと決めた」を区別するため）。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行（`bun run test:integration` が docker-compose の
 * test-db 既定値を注入する）。gateway は import 時の `process.env.DATABASE_URL` を
 * 読むため動的 import より前に上書きする。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

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

/**
 * 走査で拾えるよう、他のどの行にも現れない綴りにする。
 *
 * 電話番号の列が最も狭い（`VarChar(20)` 系）ので、そこに収まる長さにする。
 * 溢れると `LengthMismatch` で fixture 作成ごと落ちる。
 */
const TOKEN = `pii${crypto.randomUUID().replaceAll("-", "").slice(0, 13)}`;

const created = {
  customerId: "",
  mergeTargetCustomerId: "",
  reservationId: "",
  inquiryId: "",
  registrationId: "",
  eventId: "",
  spaceId: "",
  locationId: "",
  categoryId: "",
};

/** そのトークンを含む行を持つテーブル名（`to_jsonb` で全列を一度に見る）。 */
async function tablesStillHolding(token: string): Promise<string[]> {
  const tables = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name::text AS table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;

  const hits: string[] = [];
  for (const { table_name: table } of tables) {
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

    const customer = await prisma.customer.create({
      data: {
        email: `${TOKEN}@example.com`,
        emailCanonical: `${TOKEN}@example.com`,
        lastName: `姓${TOKEN}`,
        firstName: `名${TOKEN}`,
        phoneNumber: TOKEN,
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
    // 問い合わせも連鎖匿名化の対象。件名も自由記入（200 文字）で、実際に
    // 氏名や電話番号が書かれる（監査 F-52）。
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

    // 短命トークン台帳。期限切れで消える仕組みは無く、消えるのは
    // 「同じ customerId の再リクエスト」「Customer の物理削除」「匿名化」の 3 経路だけ。
    // 退会は物理削除ではないので、匿名化が消さなければ実アドレスが残り続ける。
    await prisma.pendingCustomerEmailChange.create({
      data: {
        customerId: created.customerId,
        newEmail: `${TOKEN}@example.com`,
        newEmailCanonical: `${TOKEN}@example.com`,
        tokenHash: `a${TOKEN}`.padEnd(64, "0").slice(0, 64),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    // 統合は 2 つの Customer を指す。source 側に紐づく行も消えることを見たいので、
    // 対象顧客を **source** に置く（target は別の顧客）。
    // 統合先のアドレスに TOKEN を混ぜない。混ぜると、匿名化されない**別の顧客**の
    // 行が走査に引っかかり、「消えていない」と読み違える（実際に一度そうなった）。
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
  });

  afterAll(async () => {
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
    await prisma.inquiryReply.deleteMany({
      where: { inquiryId: created.inquiryId },
    });
    await prisma.inquiry.deleteMany({ where: { id: created.inquiryId } });
    await prisma.reservation.deleteMany({
      where: { id: created.reservationId },
    });
    await prisma.space.deleteMany({ where: { id: created.spaceId } });
    await prisma.location.deleteMany({ where: { id: created.locationId } });
    await prisma.customer.deleteMany({ where: { id: created.customerId } });
    await prisma.customer.deleteMany({
      where: { id: created.mergeTargetCustomerId },
    });
    await prisma.$disconnect();
  });

  test("匿名化の前は、PII が複数のテーブルに実際に入っている（検査が空振りしていない）", async () => {
    const holders = await tablesStillHolding(TOKEN);

    // 「匿名化後に 0 件」だけを見ると、そもそも書けていない場合も緑になる。
    expect(holders).toEqual([
      "customers",
      "event_registrations",
      "inquiries",
      "pending_customer_email_changes",
      "pending_customer_merges",
      "reservations",
    ]);
  });

  test("匿名化すると、証跡として残すと決めた表以外から PII が消える", async () => {
    await anonymizeCustomerCommand({
      customerId: created.customerId,
      reason: "customer-requested",
    });

    const holders = await tablesStillHolding(TOKEN);

    // `terms_agreements` は append-only の同意証跡なので残ってよい（今回の
    // fixture は同意を作っていないので実際には 0 件）。それ以外は 1 件も許さない。
    expect(holders.filter((table) => table !== "terms_agreements")).toEqual([]);
  });
});
