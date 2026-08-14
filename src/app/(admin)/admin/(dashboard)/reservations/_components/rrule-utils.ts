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
  /** UNTIL の日付部分 (`YYYY-MM-DD`)。時刻部は JST のその日の終わり (T145959Z)。 */
  until?: string;
}

/**
 * RFC 5545 RRULE 文字列を組み立てる (client-safe、rrule package を使わない)。
 *
 * output 例:
 *   - `FREQ=WEEKLY;INTERVAL=1;BYDAY=TU,TH;COUNT=10`
 *   - `FREQ=DAILY;INTERVAL=2;UNTIL=20260901T145959Z`
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
 * `YYYY-MM-DD`（JST の暦日）を RFC 5545 UNTIL 形式に変換する。
 *
 * **その日の終わり**を指す（監査 F-36）。旧実装は `T000000Z` で、これは
 * JST 09:00 を意味していた。UNTIL は inclusive な上限なので、終了日当日の
 * occurrence が JST 09:00 より後（既定営業時間 09:00-21:00 の実質すべての枠）だと
 * rrule が除外し、**終了日当日の 1 件が必ず落ちる**。
 *
 * 「毎週火曜 10:00-12:00、終了日 2026-09-29」を 9/1 起点で作ると、UI の
 * RecurrencePreview は 5 件（9/1・9/8・9/15・9/22・9/29）と表示するのに、実際は
 * 4 件しか作られない。エラーも警告も出ず「4 件の予約を作成しました」とだけ出るので、
 * 顧客は最終日の予約があると思って来訪する（その枠は他の予約に取られうる）。
 *
 * JST 23:59:59 = UTC 14:59:59。
 */
function formatUntil(isoDate: string): string {
  return `${isoDate.replaceAll("-", "")}T145959Z`;
}
