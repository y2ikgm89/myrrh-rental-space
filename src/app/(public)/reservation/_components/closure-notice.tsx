import type { ReactElement } from "react";
import type { BlockedDateRange } from "@/shared/domain/reservations/availability";

interface ClosureNoticeProps {
  readonly ranges: readonly BlockedDateRange[];
}

/** "YYYY-MM-DD" を "YYYY年M月D日" に整形する */
function formatJaDate(value: string): string {
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${y}年${Number(m)}月${Number(d)}日`;
}

function formatRange(range: BlockedDateRange): string {
  if (range.startDate === range.endDate) {
    return formatJaDate(range.startDate);
  }
  return `${formatJaDate(range.startDate)} 〜 ${formatJaDate(range.endDate)}`;
}

/**
 * 予約カレンダー上部に表示する臨時休業のお知らせ。
 * blocked 範囲が無い場合は何も描画しない（Editorial Magazine の控えめな注記）。
 */
export function ClosureNotice({
  ranges,
}: ClosureNoticeProps): ReactElement | null {
  if (ranges.length === 0) return null;

  return (
    <div
      role="note"
      className="mb-6 border border-border bg-surface p-4 text-sm text-muted-foreground"
    >
      <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-foreground">
        臨時休業のお知らせ
      </p>
      <ul className="space-y-1">
        {ranges.map((range) => (
          <li key={`${range.startDate}-${range.endDate}`}>
            <span className="text-foreground">{formatRange(range)}</span>
            {range.reason ? (
              <span className="ml-2 text-muted-foreground">
                （{range.reason}）
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
