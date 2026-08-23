/**
 * alert policy の `duration` を `alignment_period` と同値にしない（監査 A-30）。
 *
 * ## なぜ
 *
 * Cloud Monitoring の `duration` は「条件が違反状態を維持しなければならない時間」。
 * `alignment_period` と同じ値を入れると、整列後の点が **2 点連続**で閾値超えに
 * ならない限りインシデントが開かない。
 *
 * `reported_error_burst` は 20 件 / 5 分の**バースト**を検知するためのポリシーなのに、
 * `duration = alignment_period = 300s` だったため、まさにその形（5 分続いて 6 分目に
 * 復旧する bad deploy）が発火しなかった。エラーバジェット 43.2 分の約 12% を焼く
 * 事象が、設計意図どおりに検知されない。
 *
 * ## 何を見るか
 *
 * `terraform/monitoring.tf` の各 `condition_threshold` について、`duration` が
 * 非ゼロかつ `alignment_period` と同値でないこと。
 *
 * **`duration = 0s` を強制はしない。** 持続性が本当に必要なポリシーはありうる。
 * 禁じるのは「整列窓と同じ長さを持続時間に入れる」形だけで、それは意図した閾値の
 * 2 倍の時間を待つことになるので、ほぼ確実に書き間違いである。
 *
 * ## 直し方
 *
 * 持続性が不要なら `duration = "0s"`。必要なら `alignment_period` を短くして、
 * 閾値をその窓に合わせて換算し直す。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const MONITORING_TF = join(process.cwd(), "terraform", "monitoring.tf");

type ThresholdCondition = {
  readonly displayName: string;
  readonly duration: string;
  readonly alignmentPeriod: string;
};

/** `condition_threshold` ブロックごとに display_name / duration / alignment_period を拾う。 */
export function collectThresholdConditions(hcl: string): ThresholdCondition[] {
  const out: ThresholdCondition[] = [];
  const blocks = hcl.split("condition_threshold {").slice(1);
  for (const [index, block] of blocks.entries()) {
    const before = hcl.split("condition_threshold {")[index] ?? "";
    const displayName =
      [...before.matchAll(/display_name\s*=\s*"([^"]+)"/gu)].at(-1)?.[1] ??
      `(condition ${index})`;
    const duration = /\bduration\s*=\s*"([^"]+)"/u.exec(block)?.[1] ?? "";
    const alignmentPeriod =
      /\balignment_period\s*=\s*"([^"]+)"/u.exec(block)?.[1] ?? "";
    out.push({ displayName, duration, alignmentPeriod });
  }
  return out;
}

/** 整列窓と同じ長さを持続時間に入れている条件を返す。 */
export function findDurationEqualsAlignment(
  conditions: readonly ThresholdCondition[],
): string[] {
  return conditions
    .filter(
      (condition) =>
        condition.duration !== "" &&
        condition.duration !== "0s" &&
        condition.duration === condition.alignmentPeriod,
    )
    .map(
      (condition) =>
        `${condition.displayName}: duration=${condition.duration} が alignment_period と同値`,
    );
}

describe("alert policy の duration", () => {
  test("走査対象が空でない（0 件と「違反なし」を分ける）", () => {
    const conditions = collectThresholdConditions(
      readFileSync(MONITORING_TF, "utf8"),
    );

    expect(conditions.length).toBeGreaterThan(3);
    expect(conditions.map((c) => c.displayName)).toContain(
      "reported error events > 20 / 5 min",
    );
    // すべての条件で両方の値を拾えている（正規表現が空振りしていない）。
    expect(
      conditions.filter((c) => c.duration === "" || c.alignmentPeriod === ""),
    ).toEqual([]);
  });

  test("落ちるべき書き方: duration と alignment_period が同値", () => {
    const hcl = `
      conditions {
        display_name = "burst"
        condition_threshold {
          duration        = "300s"
          aggregations {
            alignment_period = "300s"
          }
        }
      }
    `;
    expect(
      findDurationEqualsAlignment(collectThresholdConditions(hcl)),
    ).toHaveLength(1);
  });

  test("落ちてはいけない書き方: 0s、または窓より短い持続時間", () => {
    const zero = `
      conditions {
        display_name = "immediate"
        condition_threshold {
          duration        = "0s"
          aggregations {
            alignment_period = "300s"
          }
        }
      }
    `;
    const shorter = `
      conditions {
        display_name = "sustained"
        condition_threshold {
          duration        = "300s"
          aggregations {
            alignment_period = "60s"
          }
        }
      }
    `;
    expect(
      findDurationEqualsAlignment(collectThresholdConditions(zero)),
    ).toEqual([]);
    expect(
      findDurationEqualsAlignment(collectThresholdConditions(shorter)),
    ).toEqual([]);
  });

  test("monitoring.tf に整列窓と同値の duration が無い", () => {
    const offenders = findDurationEqualsAlignment(
      collectThresholdConditions(readFileSync(MONITORING_TF, "utf8")),
    );

    expect(offenders).toEqual([]);
  });
});
