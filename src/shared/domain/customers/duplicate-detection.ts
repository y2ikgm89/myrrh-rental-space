import "server-only";

import { prisma } from "@/shared/db/prisma";
import { RISK_FLAG_REASON } from "@/shared/lib/validations/enums/helpers";
import type { CustomerSearchResult } from "./types";
import { reconcileFlagReasonsCommand } from "./risk-detection";

const DUPLICATE_DETECTION_OWNED_REASONS = [
  RISK_FLAG_REASON.DUPLICATE_CANDIDATE,
] as const;

export type DetectedDuplicateCustomer = {
  readonly customerId: string;
};

/** マージダイアログのプリフィル用。CustomerSearchResult と互換な型。 */
export type DuplicateCandidateResult = CustomerSearchResult;

/**
 * `emailCanonical` 一致または `phoneNumber` 完全一致（ファジーマッチは対象外、
 * 設計docのユーザー決定）でグループ化し、2件以上のグループに属する全顧客を
 * 検出結果として返す。3件以上のグループも「重複の疑いあり」として全員フラグする
 * （マージ候補の1件への絞り込みは `findDuplicateCandidateFor` が個別に行う）。
 */
export async function detectDuplicateCandidates(): Promise<
  DetectedDuplicateCustomer[]
> {
  const [emailGroups, phoneGroups] = await Promise.all([
    prisma.customer.groupBy({
      by: ["emailCanonical"],
      _count: { _all: true },
      having: { emailCanonical: { _count: { gte: 2 } } },
    }),
    prisma.customer.groupBy({
      by: ["phoneNumber"],
      where: { phoneNumber: { not: null } },
      _count: { _all: true },
      having: { phoneNumber: { _count: { gte: 2 } } },
    }),
  ]);

  const customerIds = new Set<string>();

  if (emailGroups.length > 0) {
    const rows = await prisma.customer.findMany({
      where: {
        emailCanonical: { in: emailGroups.map((g) => g.emailCanonical) },
      },
      select: { id: true },
    });
    for (const row of rows) customerIds.add(row.id);
  }

  if (phoneGroups.length > 0) {
    const phoneNumbers = phoneGroups
      .map((g) => g.phoneNumber)
      .filter((p): p is string => p !== null);
    if (phoneNumbers.length > 0) {
      const rows = await prisma.customer.findMany({
        where: { phoneNumber: { in: phoneNumbers } },
        select: { id: true },
      });
      for (const row of rows) customerIds.add(row.id);
    }
  }

  return Array.from(customerIds).map((customerId) => ({ customerId }));
}

/** 検知結果を Customer.flagReasons に反映する（Task 1 の reconcile 経由）。 */
export async function applyDuplicateCandidateFlagsCommand(
  detected: readonly DetectedDuplicateCustomer[],
): Promise<number> {
  let updated = 0;
  for (const { customerId } of detected) {
    updated += await reconcileFlagReasonsCommand(customerId, {
      ownedReasons: DUPLICATE_DETECTION_OWNED_REASONS,
      detectedReasons: [RISK_FLAG_REASON.DUPLICATE_CANDIDATE],
    });
  }
  return updated;
}

/**
 * 指定顧客と emailCanonical または phoneNumber が一致する、最も古い（作成日時が
 * 早い）他の顧客を1件返す。cron の検知結果を新規フィールドとして永続化するのでは
 * なく、クリック時に都度検索することで、データ変化に対して stale にならない。
 * 一致する相手が居なければ null（複数一致する場合も最古の1件のみ返す —
 * MergeCustomerDialog は1候補のプリフィルのみサポートするため）。
 */
export async function findDuplicateCandidateFor(
  customerId: string,
): Promise<DuplicateCandidateResult | null> {
  const self = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { emailCanonical: true, phoneNumber: true },
  });
  if (!self) return null;

  const candidate = await prisma.customer.findFirst({
    where: {
      id: { not: customerId },
      OR: [
        { emailCanonical: self.emailCanonical },
        ...(self.phoneNumber ? [{ phoneNumber: self.phoneNumber }] : []),
      ],
    },
    select: {
      id: true,
      lastName: true,
      firstName: true,
      companyName: true,
      customerType: true,
      email: true,
      phoneNumber: true,
      status: true,
      userId: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return candidate;
}
