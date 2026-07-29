import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import {
  SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE,
  toExpectedUpdatedAt,
} from "@/shared/domain/settings/commands/optimistic";
import type { TransferAccountType } from "@/shared/lib/validations/enums/helpers";

export type TransferAccountWriteInput = {
  label: string;
  bankName: string;
  branchName: string;
  accountType: TransferAccountType;
  accountNumber: string;
  accountHolderName: string;
  note: string | null;
  sortOrder: number;
  isActive: boolean;
};

async function ensureTransferAccountExists(id: string): Promise<void> {
  const existing = await prisma.transferAccount.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    throw new DomainError("振込先口座が見つかりません", "NOT_FOUND");
  }
}

export async function createTransferAccountCommand(
  input: TransferAccountWriteInput,
): Promise<{ id: string }> {
  const created = await prisma.transferAccount.create({
    data: input,
    select: { id: true },
  });
  return created;
}

export async function updateTransferAccountCommand(
  id: string,
  input: TransferAccountWriteInput,
): Promise<void> {
  await ensureTransferAccountExists(id);
  await prisma.transferAccount.update({
    where: { id },
    data: input,
  });
}

export async function toggleTransferAccountActiveCommand(
  id: string,
  isActive: boolean,
): Promise<void> {
  await ensureTransferAccountExists(id);
  await prisma.transferAccount.update({
    where: { id },
    data: { isActive },
  });
}

export async function deleteTransferAccountCommand(id: string): Promise<void> {
  await ensureTransferAccountExists(id);
  await prisma.transferAccount.delete({ where: { id } });
}

export async function updateTransferGuidanceCommand(input: {
  transferGuidance: string | null;
  expectedUpdatedAt: string | Date;
}): Promise<void> {
  const expectedUpdatedAt = toExpectedUpdatedAt(input.expectedUpdatedAt);
  const result = await prisma.settingsOrganization.updateMany({
    where: { id: "singleton", updatedAt: expectedUpdatedAt },
    data: { transferGuidance: input.transferGuidance },
  });
  if (result.count === 0) {
    throw new DomainError(SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE, "CONFLICT");
  }
}
