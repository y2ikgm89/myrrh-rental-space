import "server-only";

import { prisma } from "@/shared/db/prisma";

/**
 * Receipt ダウンロード用の lookup。
 *
 * Foundation gap analysis (2026-07-15) task #7 receipt-full-wiring PR#4。
 * `/api/receipts/[serialNo]/pdf` Route Handler が ownership 検証と PDF 生成に必要な
 * 最小フィールドを取得する。
 *
 * ownership 検証:
 * - `reservation.customerId` (Reservation 由来の Receipt)
 * - `eventRegistration.customerId` (EventRegistration 由来の Receipt)
 * のいずれか一方が非 null。Route Handler が Better Auth session の customer.id と突合する。
 * ゲスト予約 (customerId=null) は署名 URL 経路で ownership を担保する。
 */
export async function findReceiptForDownload(serialNo: string) {
  return prisma.receipt.findFirst({
    where: { serialNo },
    select: {
      id: true,
      serialNo: true,
      recipientName: true,
      subject: true,
      amount: true,
      taxAmount: true,
      taxRate: true,
      issuedAt: true,
      issuerSnapshot: true,
      reservation: {
        select: { customerId: true },
      },
      eventRegistration: {
        select: { customerId: true },
      },
    },
  });
}

export type ReceiptForDownload = Awaited<
  ReturnType<typeof findReceiptForDownload>
>;

/**
 * mypage / 顧客側の一覧・詳細で「領収書ダウンロード」リンクを出すかを判定するための
 * 軽量 lookup。serialNo のみを返す (URL 生成に必要な最小情報)。
 *
 * Foundation gap analysis (2026-07-15) task #7 receipt-full-wiring PR#5。
 * Reservation / EventRegistration → 該当 Receipt の対応関係を 1 対 1 で解決する。
 * 未発行の場合は null を返し、UI 側で DL リンクを非表示にする。
 */
export async function findReceiptSerialNoByReservationId(
  reservationId: string,
): Promise<string | null> {
  const receipt = await prisma.receipt.findUnique({
    where: { reservationId },
    select: { serialNo: true },
  });
  return receipt?.serialNo ?? null;
}

export async function findReceiptSerialNoByEventRegistrationId(
  eventRegistrationId: string,
): Promise<string | null> {
  const receipt = await prisma.receipt.findUnique({
    where: { eventRegistrationId },
    select: { serialNo: true },
  });
  return receipt?.serialNo ?? null;
}

/**
 * 一覧表示 (mypage/events) 用の bulk lookup。N+1 回避のため findMany で
 * 一括取得し Map で返す。存在しない registrationId は Map に含まれない (呼出側で
 * has() チェックまたは get()===undefined フォールバック)。
 *
 * Foundation gap analysis (2026-07-15) task #8 (mypage waitlist 順位 + 領収書 UI)。
 */
export async function findReceiptSerialNoMapByEventRegistrationIds(
  eventRegistrationIds: readonly string[],
): Promise<Map<string, string>> {
  if (eventRegistrationIds.length === 0) return new Map();
  const receipts = await prisma.receipt.findMany({
    where: { eventRegistrationId: { in: [...eventRegistrationIds] } },
    select: { serialNo: true, eventRegistrationId: true },
  });
  const map = new Map<string, string>();
  for (const receipt of receipts) {
    if (receipt.eventRegistrationId !== null) {
      map.set(receipt.eventRegistrationId, receipt.serialNo);
    }
  }
  return map;
}

// ============================================================
// mypage /receipts 横断一覧クエリ (STATE-02)
// ============================================================

/**
 * 領収書 (適格請求書) の受領者側は消費税法 57条の4 で 7 年間の保管が義務付けられている。
 * `/mypage/reservations/[id]` は Reservation.deletedAt (管理者による soft-delete) を
 * `deletedAt: null` フィルタで隠すため、削除された予約の領収書へは 24h 署名 URL 経由
 * (メール本文) 以外の経路が閉ざされてしまう。event 側も対称。
 *
 * このクエリは Reservation.deletedAt / Event.deletedAt に関わらず、Customer が
 * 「所有」する Receipt を横断的に返す。適格請求書は append-only 契約 (issue.ts
 * 冒頭 docstring) のため削除には追従しない — 顧客が税務対応に必要な領収書へ
 * 恒常的にアクセスできる mypage 経路を担保する。
 */
export const RECEIPT_LIST_PAGE_SIZE = 20;

export type CustomerReceiptListSource =
  | {
      readonly type: "reservation";
      readonly reservationId: string;
      readonly spaceName: string;
      readonly startTime: Date;
      readonly isDeleted: boolean;
    }
  | {
      readonly type: "event";
      readonly eventRegistrationId: string;
      readonly eventTitle: string;
      readonly isDeleted: boolean;
    };

export interface CustomerReceiptListItem {
  readonly id: string;
  readonly serialNo: string;
  readonly issuedAt: Date;
  readonly amount: number;
  readonly source: CustomerReceiptListSource;
}

export interface CustomerReceiptsResult {
  readonly items: readonly CustomerReceiptListItem[];
  readonly totalCount: number;
  readonly currentPage: number;
  readonly totalPages: number;
  readonly pageSize: number;
}

/**
 * Customer 単位で発行済み領収書を横断取得する (STATE-02)。
 *
 * ## 契約
 * - 対象は `reservation.customerId === customerId` **OR** `eventRegistration.customerId === customerId`
 *   の Receipt。
 * - Reservation.deletedAt / Event.deletedAt は **フィルタしない** (適格請求書は
 *   append-only 証跡)。削除元は `source.isDeleted` フラグとして UI に伝えるだけ。
 * - `reissueReceiptCommand` で reservationId / eventRegistrationId が両方 NULL に
 *   なった orphan (再発行元) は OR 節のどちらにも hit しないため自動除外される。
 *   顧客には新 revision (chain 先) のみが見える。
 * - 別 Customer の Receipt は ownership check (WHERE 節) により返らない。
 * - order: issuedAt desc (最新発行順)。
 *
 * ## 分離
 * offset (page × pageSize) ベースのシンプルなページング。予約・イベント混在の
 * cursor keyset は複合順序が難しいため offset 採用 (顧客の発行件数は税務上限
 * 数百件程度で offset の suffering point に到達しない)。
 */
export async function getCustomerReceipts(
  customerId: string,
  options?: { page?: number; pageSize?: number },
): Promise<CustomerReceiptsResult> {
  const pageSize = Math.max(
    1,
    Math.min(100, options?.pageSize ?? RECEIPT_LIST_PAGE_SIZE),
  );
  const requestedPage = Math.max(1, Math.floor(options?.page ?? 1));

  const where = {
    OR: [
      { reservation: { is: { customerId } } },
      { eventRegistration: { is: { customerId } } },
    ],
  };

  const totalCount = await prisma.receipt.count({ where });
  const totalPages = totalCount === 0 ? 1 : Math.ceil(totalCount / pageSize);
  // out-of-range page はクランプする (最終ページに寄せる)。1 に強制すると
  // 直リンク共有で cursor drift 感が出るため、末端ページに落とす方が自然。
  const currentPage = Math.min(requestedPage, totalPages);
  const skip = (currentPage - 1) * pageSize;

  const rows = await prisma.receipt.findMany({
    where,
    select: {
      id: true,
      serialNo: true,
      issuedAt: true,
      amount: true,
      reservation: {
        select: {
          id: true,
          startTime: true,
          deletedAt: true,
          space: { select: { name: true } },
        },
      },
      eventRegistration: {
        select: {
          id: true,
          event: {
            select: {
              title: true,
              deletedAt: true,
            },
          },
        },
      },
    },
    orderBy: { issuedAt: "desc" },
    skip,
    take: pageSize,
  });

  const items: CustomerReceiptListItem[] = [];
  for (const row of rows) {
    if (row.reservation !== null) {
      items.push({
        id: row.id,
        serialNo: row.serialNo,
        issuedAt: row.issuedAt,
        amount: row.amount,
        source: {
          type: "reservation",
          reservationId: row.reservation.id,
          spaceName: row.reservation.space.name,
          startTime: row.reservation.startTime,
          isDeleted: row.reservation.deletedAt !== null,
        },
      });
    } else if (row.eventRegistration !== null) {
      items.push({
        id: row.id,
        serialNo: row.serialNo,
        issuedAt: row.issuedAt,
        amount: row.amount,
        source: {
          type: "event",
          eventRegistrationId: row.eventRegistration.id,
          eventTitle: row.eventRegistration.event.title,
          isDeleted: row.eventRegistration.event.deletedAt !== null,
        },
      });
    }
    // 両方 null (orphan) は WHERE で除外済み。防御的に skip する
    // (何らかの edge で漏れても UI 側で「予約」「イベント」いずれかの
    // 表示が必要なため row 全体を落とす)。
  }

  return { items, totalCount, currentPage, totalPages, pageSize };
}
