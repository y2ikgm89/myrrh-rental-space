export function formatDate(
  date: Date | string | null | undefined,
  includeTime = false,
): string {
  if (!date) return "";

  const value = typeof date === "string" ? new Date(date) : date;
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
  };

  if (includeTime) {
    options.hour = "2-digit";
    options.minute = "2-digit";
  }

  return value.toLocaleDateString("ja-JP", options);
}

export function formatDateShort(
  date: Date | string | null | undefined,
): string {
  if (!date) return "-";
  const value = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function formatDateTimeShort(
  date: Date | string | null | undefined,
): string {
  if (!date) return "-";
  const value = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export function formatDateTimeFull(
  date: Date | string | null | undefined,
): string {
  if (!date) return "-";
  const value = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

// =============================================================================
// `<input type="datetime-local">` 用 JST helper（SSoT）
// =============================================================================
//
// **Why JST 固定**:
// `<input type="datetime-local">` の value は timezone 情報を持たない `"YYYY-MM-DDTHH:mm"` 文字列。
// 1) 表示側で `slice(0, 16)` で UTC ISO を切り取ると、ブラウザが local 時刻として解釈し
//    `new Date(value)` で再 UTC 化されるとオフセットが二重適用されてずれる silent bug
// 2) サーバ (Cloud Run = UTC) で `new Date("2026-05-03T12:00")` するとサーバ local (= UTC)
//    として parse され、JST 想定の管理者からすると 9 時間ずれる
//
// 解決: 表示も保存も「Asia/Tokyo 固定」で扱う。
// Browser がどこの timezone でも、サーバが UTC でも、JST として一貫処理する。

const DATETIME_LOCAL_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
// `Z`（UTC）または `±HH:mm` オフセット付きの完全 ISO 8601 文字列を検出する。
// Zod 4 `.datetime({ local: true })` は local + full ISO の両方を許容するため、
// helper も同等にし、絶対時刻表現はそのまま `Date` constructor に委譲する。
const FULL_ISO_OFFSET_REGEX = /[Zz]$|[+-]\d{2}:?\d{2}$/;

/**
 * Date を `<input type="datetime-local">` 用の JST 文字列 (`"YYYY-MM-DDTHH:mm"`) に整形。
 *
 * `Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" })` で JST 固定の
 * ISO-like 形式 (`"YYYY-MM-DD HH:mm"`) を取得し、半角スペースを `T` に置換する。
 * サーバ tz / ブラウザ tz に依存しない。
 */
export function formatDateTimeLocalInJst(date: Date | string): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  })
    .format(value)
    .replace(" ", "T");
}

/**
 * `<input type="datetime-local">` の値 (`"YYYY-MM-DDTHH:mm"` / `"...:ss"`)
 * または full ISO 8601 文字列を Date に変換する。
 *
 * - **timezone 指定なし**（`"2026-05-03T12:00"`）→ JST として明示的に parse
 *   （`+09:00` を付与）。サーバ tz / ブラウザ tz に依存せず常に JST 解釈
 * - **`Z` または `±HH:mm` 付き**（`"2026-05-03T03:00:00.000Z"`）→ 絶対時刻として
 *   そのまま `Date` constructor に委譲（Zod 4 `.datetime({ local: true })` が
 *   両形式を許容するのと整合）
 * - 不正な形式は `Invalid Date` を返す
 */
export function parseDateTimeLocalAsJst(value: string): Date {
  if (FULL_ISO_OFFSET_REGEX.test(value)) {
    return new Date(value);
  }
  if (!DATETIME_LOCAL_REGEX.test(value)) {
    return new Date(Number.NaN);
  }
  const withSeconds = value.length === 16 ? `${value}:00` : value;
  return new Date(`${withSeconds}+09:00`);
}

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `<input type="date">` の値 (`"YYYY-MM-DD"`、JST カレンダー日付) を
 * Prisma `@db.Date` カラム保存用の **UTC 深夜 Date** に変換する。
 *
 * `BlockedDate.startDate` / `endDate` 等の `@db.Date` 列は
 * 「JST カレンダー日付を UTC 深夜で保持」する設計のため、`"2026-12-29"` →
 * `2026-12-29T00:00:00.000Z` に変換する。サーバ tz / ブラウザ tz に依存しない。
 *
 * - 不正な形式は `Invalid Date` を返す
 *
 * 時刻つきの予約 datetime (UTC) を JST カレンダー日付に落とす変換は別関数
 * （`@/shared/domain/reservations/availability` の cascade ロジック）で行う。
 */
export function parseJstDateOnly(value: string): Date {
  if (!DATE_ONLY_REGEX.test(value)) {
    return new Date(Number.NaN);
  }
  return new Date(`${value}T00:00:00.000Z`);
}

/**
 * Prisma `@db.Date` カラム（UTC 深夜 Date）を `"YYYY-MM-DD"` 文字列に戻す。
 *
 * `@db.Date` は UTC 深夜で保持されるため、`toISOString()` の日付部分が
 * そのまま JST カレンダー日付になる（`parseJstDateOnly` の逆変換）。
 */
export function formatJstDateOnly(date: Date | string): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return value.toISOString().slice(0, 10);
}

const JST_MACHINE_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * 任意の datetime を JST カレンダー日付の machine 形式 `"YYYY-MM-DD"` に整形する。
 *
 * `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" })` で JST 固定の
 * ISO-like 日付文字列を返す。サーバ tz（Cloud Run UTC）/ ブラウザ tz に依存しない。
 *
 * `formatJstDateOnly` との違い: あちらは `@db.Date`（UTC 深夜保持）専用で
 * `toISOString().slice(0, 10)` を使う。こちらは**時刻つき UTC datetime を
 * JST カレンダー日付に落とす**用途（dashboard チャート集計 / cron の翌日判定 /
 * 予約可能性の today 判定）。
 */
export function formatJstDateString(date: Date | string): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return JST_MACHINE_DATE_FORMATTER.format(value);
}

const MILLISECONDS_PER_HOUR = 1000 * 60 * 60;

/**
 * 2 つの Date の差を「時間（hours）」で返す。小数を含む（30 分 = 0.5）。
 *
 * 予約の base price 計算 / 表示価格プレビュー / 最小予約時間バリデーション等で
 * `(end - start) / (1000 * 60 * 60)` の magic number を散らさないための SSoT。
 */
export function calculateDurationHours(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / MILLISECONDS_PER_HOUR;
}

// =============================================================================
// 表示用 JST フォーマット helper（admin の date-fns / Intl 直接呼び出し置換用）
// =============================================================================
//
// コンポーネント内の `Intl.DateTimeFormat` 直接呼び出し / date-fns `format()` /
// `toLocaleTimeString()` は、サーバ (Cloud Run = UTC) で評価されると JST 想定の
// 表示が 9 時間ずれる silent bug の温床。表示用フォーマットも timeZone: "Asia/Tokyo"
// 固定の SSoT helper に集約する。

const JST_TIME_SHORT_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * 任意の datetime を JST の時刻 `"HH:mm"`（24 時間表記）に整形する。
 *
 * カレンダー / リストの時刻のみ表示 SSoT。サーバ tz / ブラウザ tz に依存しない。
 */
export function formatTimeShort(date: Date | string): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return JST_TIME_SHORT_FORMATTER.format(value);
}

const JST_DATE_WEEKDAY_FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
});

/**
 * 任意の datetime を JST の曜日付き日付（例 `"2026年6月1日(月)"`）に整形する。
 *
 * イベント詳細等の「日付（曜日）」表示 SSoT。
 */
export function formatDateWithWeekday(date: Date | string): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return JST_DATE_WEEKDAY_FORMATTER.format(value);
}

const JST_MONTH_DAY_TIME_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * 任意の datetime を JST の `"MM/dd HH:mm"`（年なし月日 + 時刻）に整形する。
 *
 * 期間表示（開始 〜 終了）等で年を省略する用途。`formatToParts` で JST 部品を
 * 取得し、ロケール非依存に `MM/dd HH:mm` で組み立てる。
 */
export function formatMonthDayTime(date: Date | string): string {
  const value = typeof date === "string" ? new Date(date) : date;
  const parts = JST_MONTH_DAY_TIME_FORMATTER.formatToParts(value);
  const lookup = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${lookup("month")}/${lookup("day")} ${lookup("hour")}:${lookup("minute")}`;
}

const JST_YEAR_MONTH_FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "long",
});

/**
 * 任意の datetime を JST の `"YYYY年M月"` に整形する（カレンダー月見出し等）。
 */
export function formatYearMonth(date: Date | string): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return JST_YEAR_MONTH_FORMATTER.format(value);
}

const JST_DAY_WEEKDAY_FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  day: "numeric",
  weekday: "short",
});

/**
 * 任意の datetime を JST の曜日付き日（例 `"1日(月)"`）に整形する
 * （カレンダー日ビューの見出し等）。
 */
export function formatDayWithWeekday(date: Date | string): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return JST_DAY_WEEKDAY_FORMATTER.format(value);
}
