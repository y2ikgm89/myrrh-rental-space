import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { AuditAction } from "@/shared/db/enums";
import { omitUndefined } from "@/shared/lib/serialize";

export type CreateAuditLogRecordInput = {
  userId?: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  oldValue?: object;
  newValue?: object;
  metadata?: object;
};

export async function createAuditLogRecord(
  input: CreateAuditLogRecordInput,
): Promise<void> {
  await prisma.auditLog.create({
    data: omitUndefined({
      userId: input.userId,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId,
      oldValue: input.oldValue ?? undefined,
      newValue: input.newValue ?? undefined,
      metadata: input.metadata
        ? JSON.parse(JSON.stringify(input.metadata))
        : undefined,
    }),
  });
}
