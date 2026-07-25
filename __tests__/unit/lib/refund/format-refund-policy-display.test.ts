import { describe, expect, test } from "bun:test";
import { formatRefundPolicyDisplayLines } from "@/shared/lib/refund/format-refund-policy-display";
import type { RefundPolicy } from "@/shared/domain/refund/policy";

describe("formatRefundPolicyDisplayLines", () => {
  test("sorts tiers by hoursBefore descending and appends default line", () => {
    const policy: RefundPolicy = {
      tiers: [
        { hoursBefore: 72, refundRate: 50 },
        { hoursBefore: 168, refundRate: 100 },
      ],
      defaultRefundRate: 0,
    };

    expect(formatRefundPolicyDisplayLines(policy)).toEqual([
      "利用開始の168時間以上前: 100%返金",
      "利用開始の72時間以上前: 50%返金",
      "上記に該当しない場合: 0%返金",
    ]);
  });

  test("formats fractional refund rates without trailing .0", () => {
    const policy: RefundPolicy = {
      tiers: [{ hoursBefore: 24, refundRate: 50.5 }],
      defaultRefundRate: 12.25,
    };

    expect(formatRefundPolicyDisplayLines(policy)).toEqual([
      "利用開始の24時間以上前: 50.5%返金",
      "上記に該当しない場合: 12.3%返金",
    ]);
  });

  test("shows only default line when tiers are empty", () => {
    const policy: RefundPolicy = {
      tiers: [],
      defaultRefundRate: 100,
    };

    expect(formatRefundPolicyDisplayLines(policy)).toEqual([
      "上記に該当しない場合: 100%返金",
    ]);
  });
});
