/**
 * 実 DB 統合テスト: `getInquiryById` の状態履歴が実際に引けること。
 *
 * `InquiryStatusHistory.changedById` は `AuditLog.userId` と同じ **FK を張らない
 * 論理参照**（schema.prisma の当該コメント参照）で、`changedBy` というリレーションは
 * 存在しない。それにもかかわらず select が `changedBy: { select: { name: true } }` を
 * 含んでいたため、管理画面の問い合わせ詳細は Prisma の `Unknown field` で必ず 500 に
 * なっていた。**型は通る** — select const に `satisfies Prisma.InquiryStatusHistorySelect`
 * が無かったので tsc からは見えず、実行してはじめて落ちる種類のバグだった。
 *
 * 行が 0 件でも Prisma は select 形状を検証するので、この回帰は履歴 0 件でも再現する。
 * ここでは名前解決（2 段クエリ + Map 合流）まで含めて証明するため実際に 2 行作る。
 *
 * == 後始末について ==
 * `inquiry_status_history` は append-only trigger (`prevent_inquiry_status_history_mutation`)
 * で DELETE が拒否される。親 `Inquiry` の削除は Cascade で子へ DELETE を伝播するため
 * **同じく落ちる**。bypass GUC は seed / data-retention purge の専用口でテストからは
 * 使わない規約（.claude/rules/db-domain.md）なので、後始末は soft-delete で行い行は残す。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行。`bun run test:integration` が
 * docker-compose の test-db 既定値を注入する。
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { InquiryStatus } from "@generated/prisma/enums";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type QueriesModule = typeof import("@/shared/domain/inquiries/queries");

let prisma: PrismaModule["prisma"];
let getInquiryById: QueriesModule["getInquiryById"];

/** `Inquiry.receiptNumber` は @unique なので fixture 毎に採番する。 */
function generateTestReceiptNumber(): string {
  const raw = crypto
    .randomUUID()
    .replaceAll("-", "")
    .substring(0, 8)
    .toUpperCase();
  return `INQ-${raw}`;
}

describeMaybe("getInquiryById の状態履歴", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ getInquiryById } = await import("@/shared/domain/inquiries/queries"));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("履歴を引けて、changedById が User 名に解決される", async () => {
    const suffix = crypto.randomUUID();
    const staff = await prisma.user.create({
      data: {
        email: `inquiry-history-staff-${suffix}@example.com`,
        name: "対応スタッフ",
        emailVerified: false,
        role: "ADMIN",
      },
      select: { id: true, name: true },
    });

    const inquiry = await prisma.inquiry.create({
      data: {
        receiptNumber: generateTestReceiptNumber(),
        name: "問い合わせ太郎",
        email: `inquiry-history-${suffix}@example.com`,
        subject: "状態履歴の回帰テスト",
        message: "本文",
        status: InquiryStatus.IN_PROGRESS,
      },
      select: { id: true },
    });

    try {
      // 1 行目: 作成 (fromStatus null / changedById null = システム起因)
      await prisma.inquiryStatusHistory.create({
        data: {
          inquiryId: inquiry.id,
          fromStatus: null,
          toStatus: InquiryStatus.NEW,
          changedById: null,
        },
      });
      // 2 行目: スタッフによる状態変更
      await prisma.inquiryStatusHistory.create({
        data: {
          inquiryId: inquiry.id,
          fromStatus: InquiryStatus.NEW,
          toStatus: InquiryStatus.IN_PROGRESS,
          changedById: staff.id,
          reason: "担当者アサイン",
        },
      });

      // 修正前はここが Prisma の `Unknown field changedBy` で throw していた。
      const detail = await getInquiryById(inquiry.id);

      expect(detail).not.toBeNull();
      const history = detail?.statusHistory ?? [];
      expect(history).toHaveLength(2);

      const [created, assigned] = history;
      expect(created?.toStatus).toBe(InquiryStatus.NEW);
      expect(created?.changedById).toBeNull();
      expect(created?.changedByName).toBeNull();

      expect(assigned?.toStatus).toBe(InquiryStatus.IN_PROGRESS);
      expect(assigned?.changedById).toBe(staff.id);
      expect(assigned?.changedByName).toBe(staff.name);
    } finally {
      // append-only trigger のため hard delete 不可（docblock 参照）。
      await prisma.inquiry.update({
        where: { id: inquiry.id },
        data: { deletedAt: new Date() },
      });
      await prisma.user.deleteMany({ where: { id: staff.id } });
    }
  });

  test("削除済み User を指す履歴は changedByName が null になる", async () => {
    const suffix = crypto.randomUUID();
    const staff = await prisma.user.create({
      data: {
        email: `inquiry-history-gone-${suffix}@example.com`,
        name: "退職スタッフ",
        emailVerified: false,
        role: "ADMIN",
      },
      select: { id: true },
    });

    const inquiry = await prisma.inquiry.create({
      data: {
        receiptNumber: generateTestReceiptNumber(),
        name: "問い合わせ花子",
        email: `inquiry-history-gone-i-${suffix}@example.com`,
        subject: "退職者の履歴",
        message: "本文",
        status: InquiryStatus.RESOLVED,
      },
      select: { id: true },
    });

    try {
      await prisma.inquiryStatusHistory.create({
        data: {
          inquiryId: inquiry.id,
          fromStatus: InquiryStatus.NEW,
          toStatus: InquiryStatus.RESOLVED,
          changedById: staff.id,
        },
      });

      // FK が無いので User を消しても履歴の changedById は証跡として残る。
      await prisma.user.delete({ where: { id: staff.id } });

      const detail = await getInquiryById(inquiry.id);
      const row = detail?.statusHistory[0];

      expect(row?.changedById).toBe(staff.id);
      expect(row?.changedByName).toBeNull();
    } finally {
      await prisma.inquiry.update({
        where: { id: inquiry.id },
        data: { deletedAt: new Date() },
      });
      await prisma.user.deleteMany({ where: { id: staff.id } });
    }
  });
});
