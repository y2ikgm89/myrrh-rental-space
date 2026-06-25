import "server-only";

import { prisma } from "@/shared/db/prisma";
import { Prisma } from "@generated/prisma/client";
import type { AuditAction } from "@generated/prisma/enums";
import { asPrismaInputJsonValue } from "@/shared/db/prisma-input-json";
import { omitUndefined } from "@/shared/lib/serialize";

/**
 * 監査ログ書込の生入力型。
 *
 * `oldValue` / `newValue` / `metadata` は Prisma の `Json` カラムに永続化される。
 * 型自体は呼び出し側の構造的不整合（`Record<string, unknown>` 等）を許容するため
 * `unknown` で受け、書込時に `asPrismaInputJsonValue` で `Prisma.InputJsonValue`
 * に runtime narrow する。`typeof Prisma.JsonNull` の sentinel もそのまま通過させる
 * （DB null 永続化のため）。
 */
export type CreateAuditLogRecordInput = {
  userId?: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  oldValue?: Prisma.InputJsonValue | typeof Prisma.JsonNull | unknown;
  newValue?: Prisma.InputJsonValue | typeof Prisma.JsonNull | unknown;
  metadata?: Prisma.InputJsonValue | typeof Prisma.JsonNull | unknown;
};

function toJsonInput(
  value: unknown,
  message: string,
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) return undefined;
  if (value === Prisma.JsonNull) return Prisma.JsonNull;
  return asPrismaInputJsonValue(value, message);
}

export async function createAuditLogRecord(
  input: CreateAuditLogRecordInput,
): Promise<void> {
  await prisma.auditLog.create({
    data: omitUndefined({
      userId: input.userId,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId,
      oldValue: toJsonInput(input.oldValue, "監査ログの旧値形式が不正です"),
      newValue: toJsonInput(input.newValue, "監査ログの新値形式が不正です"),
      metadata: toJsonInput(
        input.metadata,
        "監査ログのメタデータ形式が不正です",
      ),
    }),
  });
}
