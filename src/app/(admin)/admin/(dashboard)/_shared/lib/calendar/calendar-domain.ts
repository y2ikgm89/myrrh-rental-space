import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
  eachDayOfInterval,
  addDays,
  addWeeks,
  addMonths,
  subDays,
  subWeeks,
  subMonths,
} from "date-fns";
import {
  formatDateWithWeekday,
  formatJstDateString,
  formatJstMonthDay,
  formatJstWeekdayShort,
  formatYearMonth,
} from "@/shared/lib/date-format";
import type {
  CalendarView,
  CalendarDateRange,
  CalendarEvent,
  EventPosition,
  PositionedEvent,
  BusinessHours,
} from "./calendar-types";
import { DEFAULT_BUSINESS_HOURS, CALENDAR_LAYOUT } from "./calendar-types";

/**
 * カレンダー日付範囲を計算
 */
export function getCalendarDateRange(
  date: Date,
  view: CalendarView,
): CalendarDateRange {
  let start: Date;
  let end: Date;

  switch (view) {
    case "month": {
      const monthStart = startOfMonth(date);
      const monthEnd = endOfMonth(date);
      start = startOfWeek(monthStart, { weekStartsOn: 0 });
      end = endOfWeek(monthEnd, { weekStartsOn: 0 });
      break;
    }
    case "week": {
      start = startOfWeek(date, { weekStartsOn: 0 });
      end = endOfWeek(date, { weekStartsOn: 0 });
      break;
    }
    case "day":
    case "resource": {
      start = startOfDay(date);
      end = endOfDay(date);
      break;
    }
  }

  const displayDates = eachDayOfInterval({ start, end });

  return { start, end, displayDates };
}

/**
 * 日付ナビゲーション: 次へ
 */
export function navigateNext(date: Date, view: CalendarView): Date {
  switch (view) {
    case "month":
      return addMonths(date, 1);
    case "week":
      return addWeeks(date, 1);
    case "day":
    case "resource":
      return addDays(date, 1);
  }
}

/**
 * 日付ナビゲーション: 前へ
 */
export function navigatePrevious(date: Date, view: CalendarView): Date {
  switch (view) {
    case "month":
      return subMonths(date, 1);
    case "week":
      return subWeeks(date, 1);
    case "day":
    case "resource":
      return subDays(date, 1);
  }
}

/**
 * 営業時間の時間枠を生成
 */
export function generateTimeSlots(
  hours: BusinessHours = DEFAULT_BUSINESS_HOURS,
  intervalMinutes: number = 60,
): string[] {
  const slots: string[] = [];
  const totalMinutes = (hours.endHour - hours.startHour) * 60;

  for (let min = 0; min < totalMinutes; min += intervalMinutes) {
    const hour = hours.startHour + Math.floor(min / 60);
    const minute = min % 60;
    slots.push(
      `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    );
  }

  return slots;
}

/**
 * 2 つの日時を JST (Asia/Tokyo) 基準で「同じ日か」判定する。
 *
 * date-fns の `isSameDay` はランタイム TZ で日付を比較するため、サーバー (UTC) と
 * クライアント (JST) で評価結果が分かれる潜在バグがある。本関数は `formatJstDateString`
 * (Intl.DateTimeFormat の timeZone="Asia/Tokyo") を経由して JST の YYYY-MM-DD に
 * 正規化してから比較するため、ランタイム TZ に依存しない。
 *
 * カレンダー系のイベント日付比較は全てここに集約する (#634-637 系の locale 漏れ撲滅)。
 */
export function isSameJstDay(a: string | Date, b: string | Date): boolean {
  return formatJstDateString(a) === formatJstDateString(b);
}

/**
 * 日付が JST 基準で `now` より過去日 (= 今日より前) か判定する。
 * 「過去日 muted」表示の SSoT。
 */
export function isPastJstDay(date: string | Date, now: Date): boolean {
  return formatJstDateString(date) < formatJstDateString(now);
}

/**
 * イベントが終了済み (endTime < now) か判定する。
 * Google Calendar / Outlook 同等の「過去イベント opacity 落とし」SSoT。
 *
 * 日 (day) ベースの `isPastJstDay` と異なり、こちらは時刻 (時:分) 単位で判定する。
 * 当日のイベントでも終了時刻を過ぎれば true になる。
 */
export function isEventEnded(endTime: string | Date, now: Date): boolean {
  const end = typeof endTime === "string" ? new Date(endTime) : endTime;
  return end.getTime() < now.getTime();
}

/** JST の hour / minute を Intl.DateTimeFormat で抽出 (ランタイム TZ 非依存) */
function getJstHourMinute(date: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  return {
    hour: Number(parts.find((p) => p.type === "hour")?.value ?? "0"),
    minute: Number(parts.find((p) => p.type === "minute")?.value ?? "0"),
  };
}

/**
 * 営業開始 (JST) から `now` までの経過分。
 * - 負値 = 営業時間前 (例: 営業 09:00 で now=08:00 → -60)
 * - 0 〜 営業時間内
 * - 営業時間以上 = 営業終了後
 *
 * TimeGrid の「Now ライン」位置計算 SSoT。
 */
export function minutesSinceJstBusinessStart(
  now: Date,
  hours: BusinessHours = DEFAULT_BUSINESS_HOURS,
): number {
  const { hour, minute } = getJstHourMinute(now);
  return hour * 60 + minute - hours.startHour * 60;
}

/**
 * 列内の最大同時並走イベント数を計算する。
 *
 * `layoutOverlappingEvents` の戻り値 `position.width` (%) は
 *   100 / columnCount - 1
 * で生成されるため、最小幅から columnCount を逆算できる。
 * WeekView/DayView の動的列幅算定で共通利用される。
 */
export function maxConcurrentColumns(positioned: PositionedEvent[]): number {
  if (positioned.length === 0) return 1;
  const minWidthPct = positioned.reduce(
    (min, e) => Math.min(min, e.position.width),
    100,
  );
  return Math.max(1, Math.round(100 / Math.max(minWidthPct + 1, 1)));
}

/**
 * イベントのグリッド位置を計算
 */
export function calculateEventPosition(
  event: CalendarEvent,
  hours: BusinessHours = DEFAULT_BUSINESS_HOURS,
  pixelsPerHour: number = CALENDAR_LAYOUT.pixelsPerHour,
): EventPosition {
  const start = new Date(event.startTime);
  const end = new Date(event.endTime);
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();
  const dayStartMinutes = hours.startHour * 60;
  const dayEndMinutes = hours.endHour * 60;

  // 範囲外クリッピング
  const clippedStart = Math.max(startMinutes, dayStartMinutes);
  const clippedEnd = Math.min(endMinutes, dayEndMinutes);

  const duration = Math.max(0, clippedEnd - clippedStart);
  const offset = Math.max(0, clippedStart - dayStartMinutes);
  const rawHeightPx = (duration / 60) * pixelsPerHour;

  return {
    top: (offset / 60) * pixelsPerHour,
    // 営業時間外イベント (例: 22:00-23:00 で 9-21 時制限) や、日跨ぎで開始日の
    // 営業時間と非交差な区間は duration=0 → height=0 を返す。呼び出し側は
    // `layoutOverlappingEvents` の段階で除外する (ghost cell を描画しない)。
    // それ以外は WCAG タッチ標的を満たす最低 20px を保証。
    height: rawHeightPx <= 0 ? 0 : Math.max(rawHeightPx, 20),
    left: 0,
    width: 100,
    zIndex: 1,
  };
}

/**
 * 重複イベントの配置を調整
 */
export function layoutOverlappingEvents(
  events: CalendarEvent[],
  hours: BusinessHours = DEFAULT_BUSINESS_HOURS,
  pixelsPerHour: number = CALENDAR_LAYOUT.pixelsPerHour,
): PositionedEvent[] {
  if (events.length === 0) return [];

  // 開始時間でソート（ISO 8601 文字列は辞書順 = 時系列順）
  const sorted = [...events].sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  );

  // 重複グループを検出
  const groups: CalendarEvent[][] = [];
  let currentGroup: CalendarEvent[] = [];

  for (const event of sorted) {
    if (currentGroup.length === 0) {
      currentGroup.push(event);
      continue;
    }

    // 現在のグループと重複するか確認
    const hasOverlap = currentGroup.some(
      (e) => e.startTime < event.endTime && event.startTime < e.endTime,
    );

    if (hasOverlap) {
      currentGroup.push(event);
    } else {
      groups.push(currentGroup);
      currentGroup = [event];
    }
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  // 各グループ内でカラム配置
  const result: PositionedEvent[] = [];

  for (const group of groups) {
    const columns: CalendarEvent[][] = [];

    for (const event of group) {
      let placed = false;

      for (const column of columns) {
        // 列内の **全イベント** と非重複であることを確認する。
        // 旧実装は `lastInColumn.endTime <= event.startTime` だけ見ていたため、
        // [A(00:00-02:00), B(01:00-03:00), C(00:30-01:30)] のように 3 件以上の
        // 重複が staggered に並ぶケースで列分散が壊れた (audit #685 後の F2)。
        const canPlace = column.every((e) => e.endTime <= event.startTime);
        if (canPlace) {
          column.push(event);
          placed = true;
          break;
        }
      }

      if (!placed) {
        columns.push([event]);
      }
    }

    const columnCount = columns.length;
    // 1 カラム時のみ width: 100% (1% マージン非適用)、それ以外は 1% マージン
    const columnWidth = 100 / columnCount;
    const widthMargin = columnCount > 1 ? 1 : 0;

    columns.forEach((column, colIndex) => {
      for (const event of column) {
        const position = calculateEventPosition(event, hours, pixelsPerHour);
        // 営業時間外 / 日跨ぎで描画領域 0 のものは layout 段階で除外し
        // ghost cell が DOM に残らないようにする。
        if (position.height === 0) continue;
        result.push({
          ...event,
          position: {
            ...position,
            left: colIndex * columnWidth,
            width: columnWidth - widthMargin,
            zIndex: colIndex + 1,
          },
        });
      }
    });
  }

  return result;
}

/**
 * 指定日のイベントを取得 (JST 基準で同日判定)
 */
export function getEventsForDay(
  events: CalendarEvent[],
  day: Date,
): CalendarEvent[] {
  return events.filter((event) => isSameJstDay(event.startTime, day));
}

/**
 * ステータス別色クラスを取得（カレンダーイベント用）
 *
 * デザイン方針 (PR #692 — Carbon Design / Linear / Jira / Notion / Apple HIG 公式準拠):
 * - 5 status を **5 hue で完全分離** (PENDING=黄 / CONFIRMED=緑 / COMPLETED=青 /
 *   NO_SHOW=赤 / CANCELLED=灰) — 色だけで一目識別可能
 * - alpha scale を `/15` tint + border-l-4 + `hover:/25` の 5 段で統一
 *   (旧 COMPLETED の bg-muted 100% solid の密度逸脱と COMPLETED+CANCELLED の灰系衝突を解消)
 * - text は **text-foreground** 統一 (旧 text-muted-foreground は WCAG 4.5:1 ギリギリ
 *   を回避し AAA 余裕 pass に)
 * - 色覚多様性 (CUD): 色 hue 5 値分離 + Tabler icon (Clock/Check/CircleCheck/
 *   AlertCircle/X) + 日本語ラベル + CANCELLED 取消線/opacity-60/saturate-50 (PR #688-690)
 *   の **4 重符号化** で WCAG SC 1.4.1 (色に依存しない) を担保
 *
 * 業界整合:
 * - COMPLETED = info (青) は Linear / Jira / Notion / Carbon Blue=Info の事実上の標準
 * - CANCELLED は destructive (赤) を当てず muted (灰) — 取消は事実状態でありアクション
 *   ではない (shadcn destructive variant 意味論 + Apple HIG systemGray)
 * - NO_SHOW のみ destructive (赤) — ネガティブな確定 outcome で要フォロー
 */
export function getStatusColorClass(status: string): string {
  switch (status) {
    case "PENDING":
      return "bg-warning/15 border-l-warning text-foreground hover:bg-warning/25";
    case "CONFIRMED":
      return "bg-success/15 border-l-success text-foreground hover:bg-success/25";
    case "COMPLETED":
      return "bg-info/15 border-l-info text-foreground hover:bg-info/25";
    case "NO_SHOW":
      return "bg-destructive/15 border-l-destructive text-foreground hover:bg-destructive/25";
    case "CANCELLED":
      return "bg-muted/40 border-l-muted-foreground text-foreground hover:bg-muted/60";
    default:
      return "bg-muted/40 border-l-muted-foreground text-foreground hover:bg-muted/60";
  }
}

/**
 * スペース別色クラスを取得（ハッシュベース）
 */
export function getSpaceColorClass(spaceId: string, index?: number): string {
  const colors = [
    "border-l-cal-1",
    "border-l-cal-2",
    "border-l-cal-3",
    "border-l-cal-4",
    "border-l-cal-5",
    "border-l-cal-6",
    "border-l-cal-7",
    "border-l-cal-8",
  ];

  if (index !== undefined) {
    return colors[index % colors.length] ?? colors[0] ?? "border-l-cal-1";
  }

  const hash = spaceId
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length] ?? colors[0] ?? "border-l-cal-1";
}

/**
 * 日付ラベルをフォーマット
 */
export function formatDateLabel(date: Date, view: CalendarView): string {
  switch (view) {
    case "month":
      return formatYearMonth(date);
    case "week": {
      const weekStart = startOfWeek(date, { weekStartsOn: 0 });
      const weekEnd = endOfWeek(date, { weekStartsOn: 0 });
      return `${formatJstMonthDay(weekStart)} - ${formatJstMonthDay(weekEnd)}`;
    }
    case "day":
    case "resource":
      return formatDateWithWeekday(date);
  }
}

/** 曜日ヘッダー生成用の基準サンデー (2024-01-07 = 日曜) — モジュール解決時に 1 度だけ評価される pure な定数 */
const WEEKDAY_REFERENCE_SUNDAY = new Date(2024, 0, 7);

/** 曜日ヘッダー (JST 固定) を Intl.DateTimeFormat 経由で生成・モジュール初期化時に確定 */
const WEEKDAY_HEADERS: readonly string[] = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(WEEKDAY_REFERENCE_SUNDAY);
  d.setDate(WEEKDAY_REFERENCE_SUNDAY.getDate() + i);
  return formatJstWeekdayShort(d);
});

/**
 * 曜日ヘッダーを生成 (日, 月, 火, 水, 木, 金, 土)
 *
 * `formatJstWeekdayShort` (Intl.DateTimeFormat "Asia/Tokyo" 固定) 経由で生成し、
 * hard-coded 配列との混在 (#634 系の locale 漏れリスク) と Cloud Run (UTC) 環境の
 * silent TZ ずれを両方防ぐ。
 */
export function getWeekdayHeaders(): readonly string[] {
  return WEEKDAY_HEADERS;
}

/**
 * 曜日の色クラスを取得
 */
export function getWeekdayColorClass(dayIndex: number): string {
  if (dayIndex === 0) return "text-destructive"; // 日曜
  if (dayIndex === 6) return "text-info"; // 土曜
  return "";
}
