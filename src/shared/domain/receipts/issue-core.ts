import "server-only";

import { asPrismaInputJsonValue } from "@/shared/db/json";
import { DomainError } from "@/shared/domain/domain-error";
import { fetchIssuerSnapshot } from "@/shared/domain/receipts/issuer-snapshot";
import {
  acquireReceiptAdvisoryLock,
  claimNextSerialNo,
  type ReceiptTx,
} from "@/shared/domain/receipts/serial";
import { calculateTaxExcludedPrice } from "@/shared/lib/pricing/tax";
import { PaymentStatus } from "@/shared/lib/validations/enums/prisma-types";

export type ReceiptIssueOptions = {
  readonly recipientName?: string;
  readonly subject?: string;
};

export type ReceiptIssueTarget =
  | { readonly kind: "reservation"; readonly id: string }
  | { readonly kind: "event-registration"; readonly id: string };

type ReceiptCreateFields = {
  readonly recipientName: string;
  readonly subject: string;
  readonly amount: number;
  readonly taxAmount: number;
  readonly taxRate: number;
};

type ReceiptLinkData =
  { readonly reservationId: string } | { readonly eventRegistrationId: string };

type ResolvedReceiptIssue = ReceiptCreateFields & {
  readonly link: ReceiptLinkData;
};

function assertPaidOrPartiallyRefunded(
  paymentStatus: PaymentStatus,
  entityLabel: "予約" | "イベント申込",
): void {
  if (
    paymentStatus !== PaymentStatus.PAID &&
    paymentStatus !== PaymentStatus.PARTIALLY_REFUNDED
  ) {
    throw new DomainError(
      `決済確定 (PAID) または一部返金済み (PARTIALLY_REFUNDED) 状態の${entityLabel}のみ領収書を発行できます`,
      "VALIDATION",
    );
  }
}

function assertPositiveAmount(
  amount: number,
  entityLabel: "予約" | "申込",
): void {
  if (amount <= 0) {
    throw new DomainError(
      `金額 0 の${entityLabel}は領収書を発行しません`,
      "VALIDATION",
    );
  }
}

async function resolveReservationIssue(
  tx: ReceiptTx,
  reservationId: string,
  options?: ReceiptIssueOptions,
): Promise<ResolvedReceiptIssue> {
  const reservation = await tx.reservation.findUnique({
    where: { id: reservationId, deletedAt: null },
    select: {
      totalPrice: true,
      totalPriceWithTax: true,
      taxAmount: true,
      taxRate: true,
      paymentStatus: true,
      customer: {
        select: {
          lastName: true,
          firstName: true,
          companyName: true,
        },
      },
      guestLastName: true,
      guestFirstName: true,
      guestCompanyName: true,
    },
  });

  if (!reservation) {
    throw new DomainError("予約が見つかりません", "NOT_FOUND");
  }

  assertPaidOrPartiallyRefunded(reservation.paymentStatus, "予約");

  const amount = reservation.totalPriceWithTax;
  assertPositiveAmount(amount, "予約");

  const guestName = reservation.guestCompanyName
    ? reservation.guestCompanyName
    : reservation.guestLastName || reservation.guestFirstName
      ? `${reservation.guestLastName ?? ""} ${reservation.guestFirstName ?? ""}`.trim()
      : null;
  const customerName = reservation.customer.companyName
    ? reservation.customer.companyName
    : `${reservation.customer.lastName} ${reservation.customer.firstName}`.trim();

  return {
    link: { reservationId },
    recipientName: options?.recipientName ?? guestName ?? customerName,
    subject: options?.subject ?? "スペース利用料として",
    amount,
    taxAmount: reservation.taxAmount,
    taxRate: reservation.taxRate,
  };
}

async function resolveEventRegistrationIssue(
  tx: ReceiptTx,
  registrationId: string,
  options?: ReceiptIssueOptions,
): Promise<ResolvedReceiptIssue> {
  const registration = await tx.eventRegistration.findFirst({
    where: { id: registrationId, event: { deletedAt: null } },
    select: {
      id: true,
      name: true,
      paidAmount: true,
      taxRate: true,
      paymentStatus: true,
      event: { select: { title: true } },
      customer: {
        select: {
          lastName: true,
          firstName: true,
          companyName: true,
        },
      },
    },
  });

  if (!registration) {
    throw new DomainError("イベント申込が見つかりません", "NOT_FOUND");
  }

  assertPaidOrPartiallyRefunded(registration.paymentStatus, "イベント申込");

  const amount = registration.paidAmount ?? 0;
  assertPositiveAmount(amount, "申込");

  // 税率は**決済確定時に刻んだ値**を使う。直書きしない。
  //
  // Receipt は append-only の証跡で、発行時に焼いた税率がそのまま適格請求書の
  // 税率区分・税額欄になる。適格請求書に要るのは「取引年月日時点の税率」なので、
  // 発行時点の設定ではなく `registration.taxRate`（決済確定時のスナップショット）が
  // 根拠になる。決済と発行が離れる経路（取りこぼし救済 cron・再発行・後追い発行）で
  // 標準税率が変わっていても、その取引の税率で印字される。
  //
  // 刻む前の行と、決済確定時に設定行を読めなかった行だけ設定へ落ちる。そこも
  // **既定値へは落とさない** — 推測値を証跡に焼くより、設定不備として明示的に
  // 落ちる方がよい（カレンダー取込が「未分類」カテゴリーの不在で失敗させるのと同じ判断）。
  // `getPublicTaxSettings()` は `"use cache"` なので使わない。
  const taxRate =
    registration.taxRate ??
    (
      await tx.settingsCommerce.findFirst({
        select: { taxStandardRate: true },
      })
    )?.taxStandardRate ??
    null;
  if (taxRate === null) {
    throw new DomainError(
      "税率設定が見つからないため、領収書を発行できません",
      "VALIDATION",
    );
  }
  // 税込からの逆算も tax.ts の四捨五入 SSoT。切り捨て式は置かない
  // （予約経路の calculateTaxAmount と ±1 円ずれないようにする）。
  const taxExcludedAmount = calculateTaxExcludedPrice(amount, taxRate);
  const taxAmount = amount - taxExcludedAmount;

  const customerName = registration.customer
    ? registration.customer.companyName
      ? registration.customer.companyName
      : `${registration.customer.lastName} ${registration.customer.firstName}`.trim()
    : null;

  return {
    link: { eventRegistrationId: registrationId },
    recipientName:
      options?.recipientName ??
      (customerName && customerName.length > 0
        ? customerName
        : registration.name),
    subject: options?.subject ?? `${registration.event.title} 参加費として`,
    amount,
    taxAmount,
    taxRate,
  };
}

async function resolveReceiptIssue(
  tx: ReceiptTx,
  target: ReceiptIssueTarget,
  options?: ReceiptIssueOptions,
): Promise<ResolvedReceiptIssue> {
  switch (target.kind) {
    case "reservation":
      return resolveReservationIssue(tx, target.id, options);
    case "event-registration":
      return resolveEventRegistrationIssue(tx, target.id, options);
    default: {
      const _exhaustive: never = target;
      return _exhaustive;
    }
  }
}

/**
 * 領収書初回発行の tx 内コア。entity 単位 advisory lock → idempotent check →
 * amount/recipient 解決 → serialNo 採番 → create (P2002 read-back)。
 */
export async function issueReceiptInTransaction(
  tx: ReceiptTx,
  target: ReceiptIssueTarget,
  options?: ReceiptIssueOptions,
): Promise<{
  readonly receipt: Awaited<ReturnType<ReceiptTx["receipt"]["create"]>>;
  readonly created: boolean;
}> {
  await acquireReceiptAdvisoryLock(tx, target.id);

  const existing =
    target.kind === "reservation"
      ? await tx.receipt.findUnique({
          where: { reservationId: target.id },
        })
      : await tx.receipt.findUnique({
          where: { eventRegistrationId: target.id },
        });
  if (existing) {
    return { receipt: existing, created: false };
  }

  const resolved = await resolveReceiptIssue(tx, target, options);
  const serialNo = await claimNextSerialNo(tx);
  const issuerSnapshot = await fetchIssuerSnapshot(tx);

  // P2002 を捕まえて読み直さない（監査 A-65）。
  //
  // 以前は entity unique 衝突の救済として catch の中で `tx.receipt.findUnique` を
  // 打っていたが、**SAVEPOINT が無いので tx は既に aborted** で、Postgres は
  // 25P02 を返す。呼出側は分類可能な P2002 ではなく生の 25P02 を受け取るので、
  // 真因（連番の後退）がログに一切残らなかった。
  //
  // そもそもこの読み直しは仕事をできない。同じ entity への同時発行は冒頭の
  // `acquireReceiptAdvisoryLock` + 存在チェックで直列化されており、待った側は
  // `existing` を見て早期 return する — entity unique の P2002 は到達不能。
  // 到達するのは `receipts_serial_no_key` だけで、その場合 winner は必ず null になる。
  //
  // 連番衝突の根本側は `serial.ts` が発行済み最大値と突を合わせて潰す。
  const receipt = await tx.receipt.create({
    data: {
      serialNo,
      ...resolved.link,
      recipientName: resolved.recipientName,
      subject: resolved.subject,
      amount: resolved.amount,
      taxAmount: resolved.taxAmount,
      taxRate: resolved.taxRate,
      issuerSnapshot: asPrismaInputJsonValue(
        issuerSnapshot,
        "issuerSnapshot が不正です",
      ),
    },
  });
  return { receipt, created: true };
}
