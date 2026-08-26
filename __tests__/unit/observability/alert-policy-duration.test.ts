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
  readonly hasAggregations: boolean;
};

/**
 * `condition_threshold` ブロックごとに display_name / duration / alignment_period を拾う。
 *
 * **ブロックの終端を次の `condition_*` で区切る。** 旧実装は
 * `hcl.split("condition_threshold {")` の断片をそのまま読んでいたので、
 * 最後の `condition_threshold` の「ブロック」が**ファイル末尾まで伸びていた**。
 * その後ろに別の条件種別（`condition_absent` など）が置かれると、そちらの
 * `aggregations` / `duration` / `alignment_period` を自分のものとして拾う。
 *
 * 実際に踏んだ: `cron_heartbeat` を PromQL から `condition_absent` に替えたところ、
 * 末尾の `aggregations` が SLO slow-burn の条件に混入し、「aggregations 無しの
 * 条件は SLO 2 本ちょうど」の assertion が 1 本に減って落ちた。HCL は変わって
 * いないのに落ちたので、parser 側の欠陥。
 */
export function collectThresholdConditions(hcl: string): ThresholdCondition[] {
  const starts = [...hcl.matchAll(/\bcondition_[a-z_]+\s*\{/gu)];
  const out: ThresholdCondition[] = [];

  for (const [index, start] of starts.entries()) {
    if (!start[0].startsWith("condition_threshold")) continue;

    const bodyStart = (start.index ?? 0) + start[0].length;
    const bodyEnd = starts[index + 1]?.index ?? hcl.length;
    const block = hcl.slice(bodyStart, bodyEnd);

    const previousEnd =
      index === 0
        ? 0
        : (starts[index - 1]?.index ?? 0) +
          (starts[index - 1]?.[0].length ?? 0);
    const before = hcl.slice(previousEnd, start.index ?? 0);
    const displayName =
      [...before.matchAll(/display_name\s*=\s*"([^"]+)"/gu)].at(-1)?.[1] ??
      `(condition ${index})`;

    const duration = /\bduration\s*=\s*"([^"]+)"/u.exec(block)?.[1] ?? "";
    const alignmentPeriod =
      /\balignment_period\s*=\s*"([^"]+)"/u.exec(block)?.[1] ?? "";
    const hasAggregations = /\baggregations\s*\{/u.test(block);
    out.push({ displayName, duration, alignmentPeriod, hasAggregations });
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
    // metric 条件は duration と alignment_period の両方が要る。SLO burn-rate は
    // aggregations 無し（filter のみ）— https://cloud.google.com/monitoring/alerts/using-slo-burndown-alerts
    expect(
      conditions.filter(
        (c) =>
          c.duration === "" || (c.hasAggregations && c.alignmentPeriod === ""),
      ),
    ).toEqual([]);
    expect(
      conditions.filter((c) => !c.hasAggregations).map((c) => c.displayName),
    ).toEqual([
      "public availability SLO fast burn rate > 10 (60m)",
      "public availability SLO slow burn rate > 2 (24h)",
    ]);
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

  test("落ちるべき書き方: aggregations ありで alignment_period 欠落", () => {
    const hcl = `
      conditions {
        display_name = "broken alignment"
        condition_threshold {
          duration        = "60s"
          aggregations {
          }
        }
      }
    `;
    const conditions = collectThresholdConditions(hcl);
    expect(
      conditions.filter(
        (c) =>
          c.duration === "" || (c.hasAggregations && c.alignmentPeriod === ""),
      ),
    ).toHaveLength(1);
  });

  test("落ちてはいけない書き方: SLO burn-rate（aggregations 無し）", () => {
    const hcl = `
      conditions {
        display_name = "public availability SLO fast burn rate > 10 (60m)"
        condition_threshold {
          filter          = "select_slo_burn_rate(\\"projects/x/slos/y\\", \\"60m\\")"
          comparison      = "COMPARISON_GT"
          threshold_value = 10
          duration        = "0s"
        }
      }
    `;
    const conditions = collectThresholdConditions(hcl);
    expect(
      conditions.filter(
        (c) =>
          c.duration === "" || (c.hasAggregations && c.alignmentPeriod === ""),
      ),
    ).toEqual([]);
    expect(conditions[0]?.hasAggregations).toBe(false);
  });

  test("後続の別種別ブロックを自分のものとして拾わない", () => {
    // 実際に踏んだ形。SLO burn-rate（aggregations 無し）のあとに
    // condition_absent（aggregations あり）が来る。旧 parser は末尾まで読むので
    // burn-rate が hasAggregations=true になり、SLO 条件の本数が減って落ちた。
    const hcl = `
      conditions {
        display_name = "public availability SLO slow burn rate > 2 (24h)"
        condition_threshold {
          filter          = "select_slo_burn_rate(\\"projects/x/slos/y\\", \\"1440m\\")"
          threshold_value = 2
          duration        = "0s"
        }
      }
      conditions {
        display_name = "cron calendar-sync silent for 2100s"
        condition_absent {
          filter   = "metric.type=\\"logging.googleapis.com/user/cron_heartbeat\\""
          duration = "1500s"
          aggregations {
            alignment_period   = "600s"
            per_series_aligner = "ALIGN_SUM"
          }
        }
      }
    `;
    const conditions = collectThresholdConditions(hcl);

    // condition_absent は condition_threshold ではないので拾わない。
    expect(conditions).toHaveLength(1);
    expect(conditions[0]?.displayName).toBe(
      "public availability SLO slow burn rate > 2 (24h)",
    );
    expect(conditions[0]?.hasAggregations).toBe(false);
    expect(conditions[0]?.duration).toBe("0s");
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
