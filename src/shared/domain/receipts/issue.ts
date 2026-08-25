import "server-only";

import { prisma } from "@/shared/db/prisma";
import { asPrismaInputJsonValue } from "@/shared/db/json";
import { DomainError } from "@/shared/domain/domain-error";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { fetchIssuerSnapshot } from "@/shared/domain/receipts/issuer-snapshot";
import {
  issueReceiptInTransaction,
  type ReceiptIssueOptions,
} from "@/shared/domain/receipts/issue-core";
import {
  acquireReceiptAdvisoryLock,
  claimNextSerialNo,
} from "@/shared/domain/receipts/serial";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors/server";
import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";

/**
 * 領収書発行 SSoT (Priority-10 audit #3、PR#17 domain 部分)。
 *
 * Reservation / EventRegistration の PAID 遷移直後 (Stripe webhook) に自動採番される想定。
 * 連番・advisory lock・issuerSnapshot 凍結は `serial.ts` / `issue-core.ts` に集約。
 */

/**
 * 領収書発行元 (source) の enum discriminator。
 *
 * OBS-02 対応: 初回発行の AuditLog metadata に載せて「どの経路で自動発行されたか」を
 * hash chain 保護された証跡として残す。
 */
export type ReceiptIssueSource =
  | "stripe-webhook"
  | "backfill-cron"
  | "seed"
  | "e2e-fixture"
  | "admin"
  | "manual-payment";

type IssueReceiptAuditInput = {
  readonly receiptId: string;
  readonly serialNo: string;
  readonly reservationId?: string;
  readonly eventRegistrationId?: string;
  readonly amount: number;
  readonly recipientName: string;
  readonly source: ReceiptIssueSource | "unknown";
};

function fireReceiptCreateAuditLog(input: IssueReceiptAuditInput): void {
  fireAndForget(
    createAuditLogRecord({
      action: AuditAction.CREATE,
      resource: "receipt",
      resourceId: input.receiptId,
      newValue: {
        serialNo: input.serialNo,
        revision: 0,
        ...(input.reservationId !== undefined
          ? { reservationId: input.reservationId }
          : {}),
        ...(input.eventRegistrationId !== undefined
          ? { eventRegistrationId: input.eventRegistrationId }
          : {}),
        amount: input.amount,
      },
      metadata: {
        source: input.source,
      },
    }),
    {
      operation: "issueReceiptAuditLog",
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: {
        receiptId: input.receiptId,
        serialNo: input.serialNo,
        source: input.source,
      },
    },
  );
}

type IssueReceiptPublicOptions = ReceiptIssueOptions & {
  readonly source?: ReceiptIssueSource;
};

async function issueReceiptForTarget(
  target:
    | { readonly kind: "reservation"; readonly id: string }
    | { readonly kind: "event-registration"; readonly id: string },
  options?: IssueReceiptPublicOptions,
) {
  const { receipt, created } = await prisma.$transaction((tx) =>
    issueReceiptInTransaction(tx, target, options),
  );

  if (created) {
    fireReceiptCreateAuditLog({
      receiptId: receipt.id,
      serialNo: receipt.serialNo,
      ...(target.kind === "reservation"
        ? { reservationId: target.id }
        : { eventRegistrationId: target.id }),
      amount: Number(receipt.amount),
      recipientName: receipt.recipientName,
      source: options?.source ?? "unknown",
    });
  }
  return receipt;
}

/**
 * Reservation の PAID 遷移直後に領収書を採番・発行する (冪等)。
 */
export async function issueReceiptForReservation(
  reservationId: string,
  options?: IssueReceiptPublicOptions,
) {
  return issueReceiptForTarget(
    { kind: "reservation", id: reservationId },
    options,
  );
}

/**
 * EventRegistration の PAID 遷移直後に領収書を採番・発行する (冪等)。
 */
export async function issueReceiptForEventRegistration(
  registrationId: string,
  options?: IssueReceiptPublicOptions,
) {
  return issueReceiptForTarget(
    { kind: "event-registration", id: registrationId },
    options,
  );
}

/**
 * 既発行の Receipt を「訂正版」として再発行する (task #7 PR#6)。
 *
 * @throws DomainError NOT_FOUND / VALIDATION / FORBIDDEN
 */
export async function reissueReceiptCommand(input: {
  readonly originalReceiptId: string;
  readonly reason: string;
  readonly expectedReservationId?: string;
  readonly expectedEventRegistrationId?: string;
}) {
  const {
    originalReceiptId,
    reason,
    expectedReservationId,
    expectedEventRegistrationId,
  } = input;

  if (reason.trim().length === 0) {
    throw new DomainError("再発行理由の入力が必要です", "VALIDATION");
  }

  return prisma.$transaction(async (tx) => {
    await acquireReceiptAdvisoryLock(tx, originalReceiptId);

    const original = await tx.receipt.findUnique({
      where: { id: originalReceiptId },
      select: {
        id: true,
        serialNo: true,
        reservationId: true,
        eventRegistrationId: true,
        recipientName: true,
        subject: true,
        amount: true,
        taxAmount: true,
        taxRate: true,
        revision: true,
      },
    });

    if (!original) {
      throw new DomainError("元領収書が見つかりません", "NOT_FOUND");
    }

    if (expectedReservationId !== undefined) {
      if (original.reservationId !== expectedReservationId) {
        throw new DomainError(
          "指定された領収書はこの予約に属していません",
          "FORBIDDEN",
        );
      }
      if (original.eventRegistrationId !== null) {
        throw new DomainError(
          "予約経路の再発行にイベント申込の領収書を指定することはできません",
          "FORBIDDEN",
        );
      }
    }
    if (expectedEventRegistrationId !== undefined) {
      if (original.eventRegistrationId !== expectedEventRegistrationId) {
        throw new DomainError(
          "指定された領収書はこのイベント申込に属していません",
          "FORBIDDEN",
        );
      }
      if (original.reservationId !== null) {
        throw new DomainError(
          "イベント申込経路の再発行に予約の領収書を指定することはできません",
          "FORBIDDEN",
        );
      }
    }

    if (
      original.reservationId === null &&
      original.eventRegistrationId === null
    ) {
      throw new DomainError(
        "既に再発行済みの領収書を base に再発行することはできません",
        "VALIDATION",
      );
    }

    const serialNo = await claimNextSerialNo(tx);
    const issuerSnapshot = await fetchIssuerSnapshot(tx);

    await tx.receipt.update({
      where: { id: originalReceiptId },
      data: {
        reservationId: null,
        eventRegistrationId: null,
      },
    });

    return tx.receipt.create({
      data: {
        serialNo,
        ...(original.reservationId !== null
          ? { reservationId: original.reservationId }
          : {}),
        ...(original.eventRegistrationId !== null
          ? { eventRegistrationId: original.eventRegistrationId }
          : {}),
        recipientName: original.recipientName,
        subject: original.subject,
        amount: original.amount,
        taxAmount: original.taxAmount,
        taxRate: original.taxRate,
        issuerSnapshot: asPrismaInputJsonValue(
          issuerSnapshot,
          "issuerSnapshot が不正です",
        ),
        reissuedFromId: originalReceiptId,
        reissuedReason: reason,
        revision: original.revision + 1,
      },
    });
  });
}
