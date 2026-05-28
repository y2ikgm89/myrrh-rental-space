import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { parseJstDateOnly } from "@/shared/lib/date-format";
import { BLOCKED_DATE_SCOPE } from "@/shared/lib/validations/enums/helpers";
import type { BlockedDateFormData } from "@/shared/lib/validations/blocked-date";

/**
 * scope に応じた紐づけ対象（スペース / 拠点）の存在を検証する。
 * Zod schema で scope discriminated union は検証済みのため、
 * SPACE なら spaceId、LOCATION なら locationId が non-null であることを前提とする。
 */
async function ensureScopeTargetExists(
  data: BlockedDateFormData,
): Promise<void> {
  if (data.scope === BLOCKED_DATE_SCOPE.SPACE) {
    if (!data.spaceId) {
      throw new DomainError("スペースを指定してください", "VALIDATION");
    }
    const space = await prisma.space.findUnique({
      where: { id: data.spaceId },
      select: { id: true },
    });
    if (!space) {
      throw new DomainError("スペースが見つかりません", "NOT_FOUND");
    }
    return;
  }

  if (data.scope === BLOCKED_DATE_SCOPE.LOCATION) {
    if (!data.locationId) {
      throw new DomainError("拠点を指定してください", "VALIDATION");
    }
    const location = await prisma.location.findUnique({
      where: { id: data.locationId },
      select: { id: true },
    });
    if (!location) {
      throw new DomainError("拠点が見つかりません", "NOT_FOUND");
    }
    return;
  }

  // GLOBAL: 紐づけ対象なし
}

async function ensureBlockedDateExists(id: string): Promise<void> {
  const existing = await prisma.blockedDate.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    throw new DomainError("休業日が見つかりません", "NOT_FOUND");
  }
}

function toBlockedDateData(data: BlockedDateFormData) {
  return {
    scope: data.scope,
    spaceId: data.scope === BLOCKED_DATE_SCOPE.SPACE ? data.spaceId : null,
    locationId:
      data.scope === BLOCKED_DATE_SCOPE.LOCATION ? data.locationId : null,
    startDate: parseJstDateOnly(data.startDate),
    endDate: parseJstDateOnly(data.endDate),
    reason: data.reason,
    type: data.type,
  };
}

export async function createBlockedDateCommand(
  data: BlockedDateFormData,
  actor: { id: string },
): Promise<{ id: string }> {
  await ensureScopeTargetExists(data);

  const created = await prisma.blockedDate.create({
    data: { ...toBlockedDateData(data), createdBy: actor.id },
    select: { id: true },
  });

  return { id: created.id };
}

export async function updateBlockedDateCommand(
  id: string,
  data: BlockedDateFormData,
): Promise<{ id: string }> {
  await ensureBlockedDateExists(id);
  await ensureScopeTargetExists(data);

  await prisma.blockedDate.update({
    where: { id },
    data: toBlockedDateData(data),
  });

  return { id };
}

export async function deleteBlockedDateCommand(
  id: string,
): Promise<{ id: string }> {
  await ensureBlockedDateExists(id);

  await prisma.blockedDate.delete({ where: { id } });

  return { id };
}
