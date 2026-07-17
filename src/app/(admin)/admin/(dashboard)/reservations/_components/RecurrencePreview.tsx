"use client";

/**
 * `<RecurrencePreview>` — 繰返し予約設定の人間可読プレビュー (Phase B.2 task 19).
 *
 * `RecurrenceState` (RecurrenceFields.tsx) を日本語の要約テキストに変換する。
 * `rrule` package は client bundle に持ち込まず、独自の string builder に留める
 * (計算は freq + interval + byday + count/until から純粋関数で導ける)。
 *
 * 例:
 *   - WEEKLY, [TU,TH], count=10 → 「毎週 火・木 に 10 回開催 (開始: 2027-05-04)」
 *   - DAILY, interval=2, until=2027-09-01 → 「2 日ごとに繰返し、2027-09-01 まで」
 *   - MONTHLY, count=6 → 「毎月 6 回開催 (開始: 2027-05-04)」
 */

import type { RecurrenceState } from "./RecurrenceFields";
import { formatJstYmd } from "@/shared/lib/date-format";
import type { Weekday } from "./rrule-utils";

const WEEKDAY_LABELS_JP: Record<Weekday, string> = {
  MO: "月",
  TU: "火",
  WE: "水",
  TH: "木",
  FR: "金",
  SA: "土",
  SU: "日",
};

interface Props {
  state: RecurrenceState;
  dtstart: Date;
}

export function RecurrencePreview({
  state,
  dtstart,
}: Props): React.JSX.Element {
  return (
    <p
      id="recurrence-preview"
      className="text-sm text-muted-foreground"
      aria-live="polite"
    >
      {buildSummaryText(state, dtstart)}
    </p>
  );
}

function buildSummaryText(state: RecurrenceState, dtstart: Date): string {
  const jst = formatJstYmd(dtstart);
  const cadence = formatCadence(state);
  const scope = formatScope(state);
  return `${cadence}${scope} (開始: ${jst})`;
}

function formatCadence(state: RecurrenceState): string {
  switch (state.freq) {
    case "DAILY":
      return state.interval === 1 ? "毎日" : `${state.interval} 日ごと`;
    case "WEEKLY": {
      const byday =
        state.byday.length > 0
          ? state.byday.map((d) => WEEKDAY_LABELS_JP[d]).join("・")
          : "";
      const interval =
        state.interval === 1 ? "毎週" : `${state.interval} 週ごと`;
      return byday ? `${interval} ${byday}` : interval;
    }
    case "MONTHLY":
      return state.interval === 1 ? "毎月" : `${state.interval} ヶ月ごと`;
  }
}

function formatScope(state: RecurrenceState): string {
  if (state.endMode === "count") {
    return ` ${state.count} 回開催`;
  }
  return state.until ? ` ${state.until} まで` : "";
}
