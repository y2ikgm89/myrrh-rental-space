/**
 * TransferAccount CRUD + transferGuidance 更新の実 DB 統合テスト。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行。
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { DomainError } from "@/shared/domain/domain-error";
import { TRANSFER_ACCOUNT_TYPE } from "@/shared/lib/validations/enums/helpers";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type CommandsModule =
  typeof import("@/shared/domain/settings/transfer-account-commands");
type QueriesModule =
  typeof import("@/shared/domain/settings/transfer-account-queries");

let prisma: PrismaModule["prisma"];
let createTransferAccountCommand: CommandsModule["createTransferAccountCommand"];
let updateTransferAccountCommand: CommandsModule["updateTransferAccountCommand"];
let toggleTransferAccountActiveCommand: CommandsModule["toggleTransferAccountActiveCommand"];
let deleteTransferAccountCommand: CommandsModule["deleteTransferAccountCommand"];
let updateTransferGuidanceCommand: CommandsModule["updateTransferGuidanceCommand"];
let listActiveTransferAccounts: QueriesModule["listActiveTransferAccounts"];
let getTransferGuidance: QueriesModule["getTransferGuidance"];

const sampleAccountInput = {
  label: "テスト口座",
  bankName: "テスト銀行",
  branchName: "本店",
  accountType: TRANSFER_ACCOUNT_TYPE.ORDINARY,
  accountNumber: "1234567",
  accountHolderName: "カ）テスト",
  note: null,
  sortOrder: 0,
  isActive: true,
} as const;

describeMaybe("settings/transfer-account commands", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({
      createTransferAccountCommand,
      updateTransferAccountCommand,
      toggleTransferAccountActiveCommand,
      deleteTransferAccountCommand,
      updateTransferGuidanceCommand,
    } = await import("@/shared/domain/settings/transfer-account-commands"));
    ({ listActiveTransferAccounts, getTransferGuidance } =
      await import("@/shared/domain/settings/transfer-account-queries"));

    await prisma.settingsOrganization.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.transferAccount.deleteMany({});
    await prisma.settingsOrganization.update({
      where: { id: "singleton" },
      data: { transferGuidance: null },
    });
  });

  test("create → update → toggle → delete の CRUD ライフサイクル", async () => {
    const { id } = await createTransferAccountCommand(sampleAccountInput);

    const active = await listActiveTransferAccounts();
    expect(active).toHaveLength(1);
    expect(active[0]?.id).toBe(id);
    expect(active[0]?.bankName).toBe("テスト銀行");

    await updateTransferAccountCommand(id, {
      ...sampleAccountInput,
      bankName: "更新銀行",
      note: "振込期限は3日以内",
    });

    const updated = await prisma.transferAccount.findUniqueOrThrow({
      where: { id },
    });
    expect(updated.bankName).toBe("更新銀行");
    expect(updated.note).toBe("振込期限は3日以内");

    await toggleTransferAccountActiveCommand(id, false);
    expect(await listActiveTransferAccounts()).toHaveLength(0);

    await toggleTransferAccountActiveCommand(id, true);
    expect(await listActiveTransferAccounts()).toHaveLength(1);

    await deleteTransferAccountCommand(id);
    expect(await prisma.transferAccount.count()).toBe(0);
  });

  test("存在しない口座への update は NOT_FOUND", async () => {
    let thrown: unknown = null;
    try {
      await updateTransferAccountCommand(
        crypto.randomUUID(),
        sampleAccountInput,
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({
      name: "DomainError",
      code: "NOT_FOUND",
    } satisfies Partial<DomainError>);
  });

  test("updateTransferGuidanceCommand は optimistic lock で案内文を更新", async () => {
    const org = await prisma.settingsOrganization.findUniqueOrThrow({
      where: { id: "singleton" },
      select: { updatedAt: true },
    });

    await updateTransferGuidanceCommand({
      transferGuidance: "振込手数料はお客様負担でお願いします。",
      expectedUpdatedAt: org.updatedAt,
    });

    expect(await getTransferGuidance()).toBe(
      "振込手数料はお客様負担でお願いします。",
    );
  });

  test("updateTransferGuidanceCommand は stale expectedUpdatedAt で CONFLICT", async () => {
    const org = await prisma.settingsOrganization.findUniqueOrThrow({
      where: { id: "singleton" },
      select: { updatedAt: true },
    });

    await updateTransferGuidanceCommand({
      transferGuidance: "初回更新",
      expectedUpdatedAt: org.updatedAt,
    });

    let thrown: unknown = null;
    try {
      await updateTransferGuidanceCommand({
        transferGuidance: "古い expectedUpdatedAt",
        expectedUpdatedAt: org.updatedAt,
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({
      name: "DomainError",
      code: "CONFLICT",
    } satisfies Partial<DomainError>);
  });
});
