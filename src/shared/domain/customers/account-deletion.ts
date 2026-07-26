import "server-only";

import { prisma } from "@/shared/db/prisma";
import { anonymizeCustomerCommand } from "@/shared/domain/customers/commands";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors/server";

/**
 * Better Auth `deleteUser.beforeDelete` 用: 連携 Customer を customer-requested
 * で匿名化する。User 物理削除は BA 本体に委譲するため `deleteLinkedUser: false`。
 *
 * @see https://www.better-auth.com/docs/concepts/users-accounts
 */
export async function anonymizeCustomerBeforeAuthUserDelete(
  userId: string,
): Promise<void> {
  const linked = await prisma.customer.findUnique({
    where: { userId },
    select: { id: true, anonymizedAt: true },
  });
  if (!linked || linked.anonymizedAt !== null) {
    return;
  }

  const anonymized = await anonymizeCustomerCommand({
    customerId: linked.id,
    reason: "customer-requested",
    deleteLinkedUser: false,
  });

  fireAndForget(
    createAuditLogRecord({
      userId,
      action: AuditAction.UPDATE,
      resource: "customer",
      resourceId: anonymized.customerId,
      oldValue: { hadUserId: anonymized.hadUserId },
      newValue: {
        anonymizedAt: anonymized.anonymizedAt.toISOString(),
        anonymizedReason: anonymized.reason,
      },
      metadata: {
        channel: "customer-mypage",
        operation: "customer_account_delete_anonymized",
        source: "better-auth-beforeDelete",
      },
    }),
    {
      operation: "auditCustomerAccountDeleteAnonymize",
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
    },
  );
}
