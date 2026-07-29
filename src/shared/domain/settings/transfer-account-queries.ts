import "server-only";

import { prisma } from "@/shared/db/prisma";
import { shouldShowTransferAccounts } from "@/shared/lib/settings/transfer-account-gate";
import type { PaymentStatus } from "@/shared/lib/validations/enums/prisma-types";
import type { TransferAccountType } from "@/shared/lib/validations/enums/helpers";
import { getValidTransferAccountType } from "@/shared/lib/validations/enums/helpers";

export type TransferAccountRecord = {
  id: string;
  label: string;
  bankName: string;
  branchName: string;
  accountType: TransferAccountType;
  accountNumber: string;
  accountHolderName: string;
  note: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const transferAccountSelect = {
  id: true,
  label: true,
  bankName: true,
  branchName: true,
  accountType: true,
  accountNumber: true,
  accountHolderName: true,
  note: true,
  sortOrder: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

function mapTransferAccount(row: {
  id: string;
  label: string;
  bankName: string;
  branchName: string;
  accountType: string;
  accountNumber: string;
  accountHolderName: string;
  note: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): TransferAccountRecord {
  return {
    ...row,
    accountType: getValidTransferAccountType(row.accountType),
  };
}

export async function listActiveTransferAccounts(): Promise<
  TransferAccountRecord[]
> {
  const rows = await prisma.transferAccount.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: transferAccountSelect,
  });
  return rows.map(mapTransferAccount);
}

export async function listAllTransferAccountsForAdmin(): Promise<
  TransferAccountRecord[]
> {
  const rows = await prisma.transferAccount.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: transferAccountSelect,
  });
  return rows.map(mapTransferAccount);
}

export async function countActiveTransferAccounts(): Promise<number> {
  return prisma.transferAccount.count({ where: { isActive: true } });
}

export async function getTransferGuidance(): Promise<string | null> {
  const row = await prisma.settingsOrganization.findUnique({
    where: { id: "singleton" },
    select: { transferGuidance: true },
  });
  return row?.transferGuidance ?? null;
}

export async function getTransferGuidanceSettings(): Promise<{
  transferGuidance: string | null;
  organizationUpdatedAt: Date;
}> {
  const row = await prisma.settingsOrganization.findUnique({
    where: { id: "singleton" },
    select: { transferGuidance: true, updatedAt: true },
  });
  return {
    transferGuidance: row?.transferGuidance ?? null,
    organizationUpdatedAt: row?.updatedAt ?? new Date(0),
  };
}

export type TransferAccountPublicDisplay = {
  bankName: string;
  branchName: string;
  accountType: TransferAccountType;
  accountNumber: string;
  accountHolderName: string;
  note: string | null;
};

function toPublicDisplay(
  account: TransferAccountRecord,
): TransferAccountPublicDisplay {
  return {
    bankName: account.bankName,
    branchName: account.branchName,
    accountType: account.accountType,
    accountNumber: account.accountNumber,
    accountHolderName: account.accountHolderName,
    note: account.note,
  };
}

export async function resolveTransferAccountsForCustomerDisplay(input: {
  paymentFeatureEnabled: boolean;
  paymentStatus: PaymentStatus;
}): Promise<{
  accounts: TransferAccountPublicDisplay[];
  guidance: string | null;
} | null> {
  const activeCount = await countActiveTransferAccounts();
  if (
    !shouldShowTransferAccounts({
      paymentFeatureEnabled: input.paymentFeatureEnabled,
      paymentStatus: input.paymentStatus,
      activeAccountCount: activeCount,
    })
  ) {
    return null;
  }

  const [accounts, guidance] = await Promise.all([
    listActiveTransferAccounts(),
    getTransferGuidance(),
  ]);

  return {
    accounts: accounts.map(toPublicDisplay),
    guidance,
  };
}
