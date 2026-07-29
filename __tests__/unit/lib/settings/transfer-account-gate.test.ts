import { describe, expect, test } from "bun:test";
import { shouldShowTransferAccounts } from "@/shared/lib/settings/transfer-account-gate";
import {
  TRANSFER_ACCOUNT_TYPE,
  TRANSFER_ACCOUNT_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { transferAccountFormSchema } from "@/shared/lib/validations/transfer-account";

describe("shouldShowTransferAccounts", () => {
  test("payment ON では非表示", () => {
    expect(
      shouldShowTransferAccounts({
        paymentFeatureEnabled: true,
        paymentStatus: "UNPAID",
        activeAccountCount: 2,
      }),
    ).toBe(false);
  });

  test("payment OFF + UNPAID + active 口座ありで表示", () => {
    expect(
      shouldShowTransferAccounts({
        paymentFeatureEnabled: false,
        paymentStatus: "UNPAID",
        activeAccountCount: 1,
      }),
    ).toBe(true);
  });

  test("payment OFF + FAILED + active 口座ありで表示", () => {
    expect(
      shouldShowTransferAccounts({
        paymentFeatureEnabled: false,
        paymentStatus: "FAILED",
        activeAccountCount: 1,
      }),
    ).toBe(true);
  });

  test("payment OFF + PAID では非表示", () => {
    expect(
      shouldShowTransferAccounts({
        paymentFeatureEnabled: false,
        paymentStatus: "PAID",
        activeAccountCount: 1,
      }),
    ).toBe(false);
  });

  test("active 口座 0 件では非表示", () => {
    expect(
      shouldShowTransferAccounts({
        paymentFeatureEnabled: false,
        paymentStatus: "UNPAID",
        activeAccountCount: 0,
      }),
    ).toBe(false);
  });
});

describe("TRANSFER_ACCOUNT_TYPE labels", () => {
  test("全 type に日本語ラベルがある", () => {
    for (const type of Object.values(TRANSFER_ACCOUNT_TYPE)) {
      expect(TRANSFER_ACCOUNT_TYPE_LABELS[type]).toBeString();
      expect(TRANSFER_ACCOUNT_TYPE_LABELS[type].length).toBeGreaterThan(0);
    }
  });
});

describe("transferAccountFormSchema", () => {
  test("必須フィールドが揃えば parse 成功", () => {
    const parsed = transferAccountFormSchema.safeParse({
      label: "本店口座",
      bankName: "三井住友銀行",
      branchName: "渋谷支店",
      accountType: TRANSFER_ACCOUNT_TYPE.ORDINARY,
      accountNumber: "1234567",
      accountHolderName: "カ）サンプル",
      sortOrder: "0",
      isActive: "true",
    });
    expect(parsed.success).toBe(true);
  });
});
