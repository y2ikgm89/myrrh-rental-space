/**
 * Client-safe RRULE (RFC 5545) string builder (Phase B.2 task 18).
 *
 * admin UI から `series-rrule.ts` (server) に渡す RRULE 文字列を、
 * `rrule` package の client bundle 持ち込みを避けるため素の string concatenation
 * で生成する。output の形は `series-rrule.ts` の `validateRruleForSeries` +
 * `RRULE_ALLOWED_KEYS` WHITELIST に整合する。
 *
 * 呼出側 (RecurrenceFields.tsx, Task 19) は本 helper で組み立てた文字列を
 * `reservation-form-schema.ts` (Task 20) の hidden input として form に載せ、
 * server action (Task 21) が Zod parse して `createReservationSeriesCommand`
 * に渡す。
 *
 * @module app/admin/reservations/_components/rrule-utils
 */

import type { ReservationSeriesFreqValue } from "@/shared/lib/validations/enums/prisma-types";

/** BYDAY で許可する曜日 (RFC 5545 §3.3.10 の 2 文字略号)。 */
export type Weekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";
export const WEEKDAYS: readonly Weekday[] = [
  "MO",
  "TU",
  "WE",
  "TH",
  "FR",
  "SA",
  "SU",
] as const;

export interface BuildRruleInput {
  freq: ReservationSeriesFreqValue;
  /** 1 以上。UI は既定 1 を渡す。 */
  interval: number;
  /** BYDAY (WEEKLY 時のみ意味を持つ)。空配列は omit。 */
  byday?: readonly Weekday[];
  /** COUNT (COUNT と UNTIL は排他、COUNT を優先)。 */
  count?: number;
  /** UNTIL の日付部分 (`YYYY-MM-DD`)。時刻部は末尾 T000000Z 固定 (JST 起点日の UTC 深夜)。 */
  until?: string;
}

/**
 * RFC 5545 RRULE 文字列を組み立てる (client-safe、rrule package を使わない)。
 *
 * output 例:
 *   - `FREQ=WEEKLY;INTERVAL=1;BYDAY=TU,TH;COUNT=10`
 *   - `FREQ=DAILY;INTERVAL=2;UNTIL=20260901T000000Z`
 *
 * 契約:
 *   - `INTERVAL` は常に出力 (省略時の暗黙 1 に依存させない)
 *   - `BYDAY` は非空配列のときのみ
 *   - `COUNT` 指定時は `UNTIL` を捨てる (RFC 5545 §3.3.10: MUST NOT co-occur)
 */
export function buildRruleString(input: BuildRruleInput): string {
  const parts: string[] = [`FREQ=${input.freq}`, `INTERVAL=${input.interval}`];

  if (input.byday !== undefined && input.byday.length > 0) {
    parts.push(`BYDAY=${input.byday.join(",")}`);
  }

  if (input.count !== undefined) {
    parts.push(`COUNT=${input.count}`);
  } else if (input.until !== undefined) {
    const until = formatUntil(input.until);
    parts.push(`UNTIL=${until}`);
  }

  return parts.join(";");
}

/**
 * `YYYY-MM-DD` を RFC 5545 UNTIL 形式 (`YYYYMMDDT000000Z`) に変換する。
 * JST カレンダー日付を UTC 深夜起点で解釈する series 契約に整合させる
 * (validation 側 `series-rrule.ts` と同じ zoning)。
 */
function formatUntil(isoDate: string): string {
  return `${isoDate.replaceAll("-", "")}T000000Z`;
}
