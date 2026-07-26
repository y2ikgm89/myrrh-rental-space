import { describe, expect, test } from "bun:test";
import {
  calculateRefundAmount,
  calculateRefundRate,
  resolveRefundPolicy,
  type RefundPolicy,
} from "@/shared/domain/refund/policy";

const BASE_NOW = new Date("2026-07-15T00:00:00Z");
const IN_HOURS = (h: number) =>
  new Date(BASE_NOW.getTime() + h * 60 * 60 * 1000);

const TIERED_POLICY: RefundPolicy = {
  tiers: [
    { hoursBefore: 168, refundRate: 100 },
    { hoursBefore: 72, refundRate: 50 },
  ],
  defaultRefundRate: 0,
};

describe("calculateRefundRate", () => {
  test("開始 7 日 (168h) 以前は 100% (最上位 tier match)", () => {
    expect(calculateRefundRate(TIERED_POLICY, IN_HOURS(200), BASE_NOW)).toBe(
      100,
    );
    expect(calculateRefundRate(TIERED_POLICY, IN_HOURS(168), BASE_NOW)).toBe(
      100,
    );
  });

  test("開始 3-7 日前 (72h ≤ 残り < 168h) は 50% (中位 tier match)", () => {
    expect(calculateRefundRate(TIERED_POLICY, IN_HOURS(100), BASE_NOW)).toBe(
      50,
    );
    expect(calculateRefundRate(TIERED_POLICY, IN_HOURS(72), BASE_NOW)).toBe(50);
  });

  test("開始 3 日以内 (残り < 72h) は defaultRefundRate (0%)", () => {
    expect(calculateRefundRate(TIERED_POLICY, IN_HOURS(24), BASE_NOW)).toBe(0);
    expect(calculateRefundRate(TIERED_POLICY, IN_HOURS(0.5), BASE_NOW)).toBe(0);
  });

  test("開始時刻を過ぎている (負数) も defaultRefundRate", () => {
    expect(calculateRefundRate(TIERED_POLICY, IN_HOURS(-10), BASE_NOW)).toBe(0);
  });

  test("tiers が空なら defaultRefundRate", () => {
    const policy: RefundPolicy = { tiers: [], defaultRefundRate: 25 };
    expect(calculateRefundRate(policy, IN_HOURS(1000), BASE_NOW)).toBe(25);
  });

  test("tiers の順序に依存しない (内部で desc sort する)", () => {
    const shuffled: RefundPolicy = {
      tiers: [
        { hoursBefore: 72, refundRate: 50 },
        { hoursBefore: 168, refundRate: 100 },
      ],
      defaultRefundRate: 0,
    };
    expect(calculateRefundRate(shuffled, IN_HOURS(100), BASE_NOW)).toBe(50);
    expect(calculateRefundRate(shuffled, IN_HOURS(200), BASE_NOW)).toBe(100);
  });

  test("100 超・負数・NaN・Infinity は 0-100 に clamp", () => {
    const bad: RefundPolicy = {
      tiers: [{ hoursBefore: 24, refundRate: 150 }],
      defaultRefundRate: -20,
    };
    expect(calculateRefundRate(bad, IN_HOURS(48), BASE_NOW)).toBe(100);
    expect(calculateRefundRate(bad, IN_HOURS(10), BASE_NOW)).toBe(0);

    const infBad: RefundPolicy = {
      tiers: [],
      defaultRefundRate: Number.POSITIVE_INFINITY,
    };
    expect(calculateRefundRate(infBad, IN_HOURS(10), BASE_NOW)).toBe(0);

    const nanBad: RefundPolicy = {
      tiers: [],
      defaultRefundRate: Number.NaN,
    };
    expect(calculateRefundRate(nanBad, IN_HOURS(10), BASE_NOW)).toBe(0);
  });
});

describe("calculateRefundAmount", () => {
  test("chargedAmount × rate / 100 を floor で切り捨て", () => {
    // rate 100% × 5000 = 5000
    expect(
      calculateRefundAmount(TIERED_POLICY, 5000, IN_HOURS(200), BASE_NOW),
    ).toBe(5000);
    // rate 50% × 5000 = 2500
    expect(
      calculateRefundAmount(TIERED_POLICY, 5000, IN_HOURS(100), BASE_NOW),
    ).toBe(2500);
    // rate 0% × 5000 = 0
    expect(
      calculateRefundAmount(TIERED_POLICY, 5000, IN_HOURS(10), BASE_NOW),
    ).toBe(0);
  });

  test("小数点は floor で切り捨て (over-refund 防止、日本円は整数)", () => {
    const policy: RefundPolicy = {
      tiers: [{ hoursBefore: 24, refundRate: 33.5 }],
      defaultRefundRate: 0,
    };
    // 5000 × 33.5 / 100 = 1675 (端数なし)
    expect(calculateRefundAmount(policy, 5000, IN_HOURS(48), BASE_NOW)).toBe(
      1675,
    );
    // 4999 × 33.5 / 100 = 1674.665 → floor 1674
    expect(calculateRefundAmount(policy, 4999, IN_HOURS(48), BASE_NOW)).toBe(
      1674,
    );
  });
});

describe("resolveRefundPolicy", () => {
  test("有効な JSON shape を configured として返す", () => {
    const raw = {
      tiers: [
        { hoursBefore: 168, refundRate: 100 },
        { hoursBefore: 72, refundRate: 50 },
      ],
      defaultRefundRate: 0,
    };
    expect(resolveRefundPolicy(raw)).toEqual({
      status: "configured",
      policy: {
        tiers: [
          { hoursBefore: 168, refundRate: 100 },
          { hoursBefore: 72, refundRate: 50 },
        ],
        defaultRefundRate: 0,
      },
    });
  });

  test("null / undefined は unset（意図的未設定）", () => {
    expect(resolveRefundPolicy(null)).toEqual({ status: "unset" });
    expect(resolveRefundPolicy(undefined)).toEqual({ status: "unset" });
  });

  test("非オブジェクトは invalid（unset と混同しない）", () => {
    expect(resolveRefundPolicy("policy")).toEqual({
      status: "invalid",
      reason: "not_object",
    });
    expect(resolveRefundPolicy(42)).toEqual({
      status: "invalid",
      reason: "not_object",
    });
    expect(resolveRefundPolicy(true)).toEqual({
      status: "invalid",
      reason: "not_object",
    });
    expect(resolveRefundPolicy([])).toEqual({
      status: "invalid",
      reason: "not_object",
    });
  });

  test("tiers 欠落 / 非配列 は invalid", () => {
    expect(resolveRefundPolicy({ defaultRefundRate: 0 })).toEqual({
      status: "invalid",
      reason: "tiers_not_array",
    });
    expect(
      resolveRefundPolicy({ tiers: "not-array", defaultRefundRate: 0 }),
    ).toEqual({
      status: "invalid",
      reason: "tiers_not_array",
    });
  });

  test("defaultRefundRate 欠落 / 型不一致 は invalid", () => {
    expect(resolveRefundPolicy({ tiers: [] })).toEqual({
      status: "invalid",
      reason: "default_refund_rate_missing",
    });
    expect(resolveRefundPolicy({ tiers: [], defaultRefundRate: "0" })).toEqual({
      status: "invalid",
      reason: "default_refund_rate_missing",
    });
  });

  test("tier の shape 不正は invalid", () => {
    expect(
      resolveRefundPolicy({
        tiers: [{ hoursBefore: 24 }],
        defaultRefundRate: 0,
      }),
    ).toEqual({
      status: "invalid",
      reason: "tier_refund_rate_invalid",
    });
    expect(
      resolveRefundPolicy({
        tiers: [{ hoursBefore: "24", refundRate: 50 }],
        defaultRefundRate: 0,
      }),
    ).toEqual({
      status: "invalid",
      reason: "tier_hours_before_invalid",
    });
    expect(
      resolveRefundPolicy({
        tiers: [null],
        defaultRefundRate: 0,
      }),
    ).toEqual({
      status: "invalid",
      reason: "tier_not_object",
    });
  });

  test("空 tiers 配列 + defaultRefundRate のみでも configured", () => {
    expect(resolveRefundPolicy({ tiers: [], defaultRefundRate: 25 })).toEqual({
      status: "configured",
      policy: { tiers: [], defaultRefundRate: 25 },
    });
  });

  test("hoursBefore が負数の tier は invalid (誤返金防止)", () => {
    expect(
      resolveRefundPolicy({
        tiers: [{ hoursBefore: -1, refundRate: 100 }],
        defaultRefundRate: 0,
      }),
    ).toEqual({
      status: "invalid",
      reason: "tier_hours_before_out_of_range",
    });
  });

  test("hoursBefore / refundRate が NaN / Infinity の tier は invalid", () => {
    expect(
      resolveRefundPolicy({
        tiers: [{ hoursBefore: Number.NaN, refundRate: 50 }],
        defaultRefundRate: 0,
      }),
    ).toEqual({
      status: "invalid",
      reason: "tier_hours_before_out_of_range",
    });
    expect(
      resolveRefundPolicy({
        tiers: [{ hoursBefore: Number.POSITIVE_INFINITY, refundRate: 50 }],
        defaultRefundRate: 0,
      }),
    ).toEqual({
      status: "invalid",
      reason: "tier_hours_before_out_of_range",
    });
    expect(
      resolveRefundPolicy({
        tiers: [{ hoursBefore: 24, refundRate: Number.NaN }],
        defaultRefundRate: 0,
      }),
    ).toEqual({
      status: "invalid",
      reason: "tier_refund_rate_not_finite",
    });
  });

  test("defaultRefundRate が NaN / Infinity は invalid", () => {
    expect(
      resolveRefundPolicy({ tiers: [], defaultRefundRate: Number.NaN }),
    ).toEqual({
      status: "invalid",
      reason: "default_refund_rate_not_finite",
    });
    expect(
      resolveRefundPolicy({
        tiers: [],
        defaultRefundRate: Number.POSITIVE_INFINITY,
      }),
    ).toEqual({
      status: "invalid",
      reason: "default_refund_rate_not_finite",
    });
  });
});
