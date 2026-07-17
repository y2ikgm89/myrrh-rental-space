import "server-only";
import { RRule, type Frequency } from "rrule";
import { RESERVATION_SERIES_FREQ } from "@/shared/lib/validations/enums/prisma-types";

/**
 * freq WHITELIST: DAILY / WEEKLY / MONTHLY のみ Phase B.2 で許可。
 * YEARLY はレア、SECONDLY/MINUTELY/HOURLY は誤操作リスク高で拒否。
 */
const ALLOWED_FREQS = new Set<Frequency>([
  RRule.DAILY,
  RRule.WEEKLY,
  RRule.MONTHLY,
]);

/**
 * RRULE 文字列 + DTSTART から rrule.js の `RRule` インスタンスを構築する。
 * 戻り値の `RRule` 型は domain 内部利用のみ（app 層に漏らさない）。
 */
export function parseRruleString(rrule: string, dtstart: Date): RRule {
  return RRule.fromString(`DTSTART:${toIcalDate(dtstart)}\nRRULE:${rrule}`);
}

/**
 * dtstart から upTo までの発生日時一覧を展開する（両端含む）。
 */
export function expandInstances(
  rrule: string,
  dtstart: Date,
  upTo: Date,
): Date[] {
  const rule = parseRruleString(rrule, dtstart);
  return rule.between(dtstart, upTo, true);
}

/**
 * dtstart から upTo までの発生回数のみを返す（`expandInstances(...).length` の shorthand）。
 */
export function countInstances(
  rrule: string,
  dtstart: Date,
  upTo: Date,
): number {
  return expandInstances(rrule, dtstart, upTo).length;
}

export type ValidateRruleInput = {
  rrule: string;
  dtstart: Date;
  /**
   * 1 回あたりの予約時間（分）。本関数では未使用（instance 展開・FREQ 検証には
   * 不要なため）。series-commands（Task 9 以降）が各 instance の [start, start+duration)
   * を組み立てる際に呼出元で使う想定で、入力契約としてここに保持している。
   */
  duration: number;
  maxInstances: number;
};

export type ValidateRruleResult =
  | { ok: true; instanceCount: number; instances: Date[] }
  | { ok: false; error: string };

/**
 * 繰返し予約 (ReservationSeries) 作成用に RRULE を検証する。
 *
 * 検証順序: (1) parse 文法エラー (2) FREQ ホワイトリスト (3) instance 0 件
 * (4) instance 数が maxInstances 超過。すべて通れば ok:true + 展開済み instances。
 */
export function validateRruleForSeries(
  input: ValidateRruleInput,
): ValidateRruleResult {
  let rule: RRule;
  try {
    rule = parseRruleString(input.rrule, input.dtstart);
  } catch (err) {
    return {
      ok: false,
      error: `RRULE 文字列の parse に失敗: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!ALLOWED_FREQS.has(rule.options.freq)) {
    return {
      ok: false,
      error: `FREQ は ${Object.keys(RESERVATION_SERIES_FREQ).join(" / ")} のみサポート`,
    };
  }

  // maxInstances 超過を検出するため、素朴に 2 年先まで展開する
  // （COUNT/UNTIL 指定なしの無限 RRULE でも安全に打ち切るための上限窓）。
  const upTo = new Date(
    input.dtstart.getTime() + 2 * 365 * 24 * 60 * 60 * 1000,
  );
  const instances = rule.between(input.dtstart, upTo, true);

  if (instances.length === 0) {
    return { ok: false, error: "instance が 0 個。RRULE を再確認してください" };
  }

  if (instances.length > input.maxInstances) {
    return {
      ok: false,
      error: `instance 数 ${instances.length} が上限 ${input.maxInstances} を超えました`,
    };
  }

  return { ok: true, instanceCount: instances.length, instances };
}

/** Date → iCalendar DATE-TIME (UTC, "20260722T100000Z" 形式) */
function toIcalDate(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}${mo}${day}T${h}${mi}${s}Z`;
}
