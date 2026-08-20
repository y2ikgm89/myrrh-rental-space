import "server-only";

import { DomainError } from "@/shared/domain/domain-error";
import {
  MANUAL_PAYMENT_RECEIPT_DEFERRED_WARNING,
  MANUAL_PAYMENT_RECEIPT_SKIPPED_WARNING,
} from "@/shared/domain/receipts/manual-payment-warnings";
import { fireAndForget } from "@/shared/lib/async-utils";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";

/**
 * 手動入金の PAID claim 後に領収書を発行する。失敗しても PAID は維持し、
 * admin UI 向け warning だけ返す。
 */
export async function issueManualPaymentReceiptBestEffort(input: {
  issue: () => Promise<{ id: string }>;
  notify: (receiptId: string) => Promise<unknown>;
  issueOperation: string;
  notifyOperation: string;
  logContext: Record<string, string>;
}): Promise<string | undefined> {
  try {
    const receipt = await input.issue();
    fireAndForget(input.notify(receipt.id), {
      operation: input.notifyOperation,
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        ...input.logContext,
        receiptId: receipt.id,
      },
    });
    return undefined;
  } catch (error) {
    if (error instanceof DomainError && error.code === "VALIDATION") {
      logError(error, {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.LOW,
        context: {
          operation: input.issueOperation,
          ...input.logContext,
          source: "manual-payment",
        },
      });
      return MANUAL_PAYMENT_RECEIPT_SKIPPED_WARNING;
    }

    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.CRITICAL,
      context: {
        operation: input.issueOperation,
        ...input.logContext,
        source: "manual-payment",
      },
    });
    return MANUAL_PAYMENT_RECEIPT_DEFERRED_WARNING;
  }
}
