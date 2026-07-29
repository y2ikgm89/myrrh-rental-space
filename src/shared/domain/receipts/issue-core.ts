import "server-only";

import { Prisma } from "@generated/prisma/client";
import { asPrismaInputJsonValue } from "@/shared/db/json";
import { DomainError } from "@/shared/domain/domain-error";
import { fetchIssuerSnapshot } from "@/shared/domain/receipts/issuer-snapshot";
import {
  acquireReceiptAdvisoryLock,
  claimNextSerialNo,
  type ReceiptTx,
} from "@/shared/domain/receipts/serial";
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

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function assertPaidOrPartiallyRefunded(
  paymentStatus: string,
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

  const taxRate = 10;
  const taxExcludedAmount = Math.floor((amount * 100) / (100 + taxRate));
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

  try {
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
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const winner =
        target.kind === "reservation"
          ? await tx.receipt.findUnique({
              where: { reservationId: target.id },
            })
          : await tx.receipt.findUnique({
              where: { eventRegistrationId: target.id },
            });
      if (winner) {
        return { receipt: winner, created: false };
      }
    }
    throw error;
  }
}
