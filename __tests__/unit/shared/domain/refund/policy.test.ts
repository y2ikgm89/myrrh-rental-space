import { describe, expect, test } from "bun:test";
import {
  calculateRefundAmount,
  calculateRefundRate,
  parseRefundPolicy,
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

describe("parseRefundPolicy", () => {
  test("有効な JSON shape を parse", () => {
    const raw = {
      tiers: [
        { hoursBefore: 168, refundRate: 100 },
        { hoursBefore: 72, refundRate: 50 },
      ],
      defaultRefundRate: 0,
    };
    const parsed = parseRefundPolicy(raw);
    expect(parsed).toEqual({
      tiers: [
        { hoursBefore: 168, refundRate: 100 },
        { hoursBefore: 72, refundRate: 50 },
      ],
      defaultRefundRate: 0,
    });
  });

  test("null / undefined / 非オブジェクトは null (fail-open)", () => {
    expect(parseRefundPolicy(null)).toBeNull();
    expect(parseRefundPolicy(undefined)).toBeNull();
    expect(parseRefundPolicy("policy")).toBeNull();
    expect(parseRefundPolicy(42)).toBeNull();
    expect(parseRefundPolicy(true)).toBeNull();
    expect(parseRefundPolicy([])).toBeNull();
  });

  test("tiers 欠落 / 非配列 は null", () => {
    expect(parseRefundPolicy({ defaultRefundRate: 0 })).toBeNull();
    expect(
      parseRefundPolicy({ tiers: "not-array", defaultRefundRate: 0 }),
    ).toBeNull();
  });

  test("defaultRefundRate 欠落 / 型不一致 は null", () => {
    expect(parseRefundPolicy({ tiers: [] })).toBeNull();
    expect(parseRefundPolicy({ tiers: [], defaultRefundRate: "0" })).toBeNull();
  });

  test("tier の shape 不正は null (フィールド欠落 / 型不一致 / null)", () => {
    expect(
      parseRefundPolicy({
        tiers: [{ hoursBefore: 24 }], // refundRate 欠落
        defaultRefundRate: 0,
      }),
    ).toBeNull();
    expect(
      parseRefundPolicy({
        tiers: [{ hoursBefore: "24", refundRate: 50 }], // 型不一致
        defaultRefundRate: 0,
      }),
    ).toBeNull();
    expect(
      parseRefundPolicy({
        tiers: [null],
        defaultRefundRate: 0,
      }),
    ).toBeNull();
  });

  test("空 tiers 配列 + defaultRefundRate のみでも有効", () => {
    const parsed = parseRefundPolicy({ tiers: [], defaultRefundRate: 25 });
    expect(parsed).toEqual({ tiers: [], defaultRefundRate: 25 });
  });
});
