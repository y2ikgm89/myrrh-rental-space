import * as holidayJp from "@holiday-jp/holiday_jp";

/**
 * 予約カレンダーで**実際に予約できる日**を導出する。
 *
 * ## なぜ位置（`.nth(n)`）で選んではいけないか
 *
 * 予約フォームには時計が 2 つある。
 *
 * - **カレンダーの「今日」** — `ReservationFormSection` が `E2E_RUNTIME=1` のとき
 *   `E2E_FIXED_NOW_ISO`（既定 `2026-07-04T03:00:00.000Z`）を `initialNowIso` として
 *   渡し、`calendar-picker.tsx` がそれを起点に過去日を無効化する
 * - **送信時の日付検証** — `publicReservationSchema` の
 *   `.refine((data) => data.date >= formatJstDateString(new Date()))` は
 *   **実時刻**で評価される。conform が client 側でも走らせるので、ブラウザの
 *   実際の時計が使われる
 *
 * この 2 つがずれているため、カレンダーは「有効」に見えるのに送信は弾かれる日が
 * 生まれる。`enabled(...).nth(3)` のような**位置指定**は、実日付が進むほど過去へ
 * ずれていき、月の 4 営業日目を過ぎた時点から月末まで必ず失敗する。表示月そのものが
 * 実時刻で決まる以上、位置は日付の代理にならない。
 *
 * ## 返す日付の条件
 *
 * - 実行時点から `SEED_RESERVATION_MAX_DAYS_OFFSET + SAFETY_MARGIN_DAYS` 日以降
 *   （seed のデモ予約と時間帯が衝突しない）
 * - **日曜以外**（`DEFAULT_BUSINESS_HOURS_WEEK` は日曜休業）
 * - 日本の祝日以外
 *
 * 呼び出し側は返り値を `page.clock.install({ time: ... })` の起点にし、
 * DayPicker が各セルに付ける安定属性 `data-day="YYYY-MM-DD"` で選択する。
 * アクセシブルネームはロケール依存（例「2026年8月21日金曜日」）なので使わない。
 */

/** `prisma/seed.ts` の `seedReservations()` が作るデモ予約の最大 daysOffset。 */
const SEED_RESERVATION_MAX_DAYS_OFFSET = 30;

/** デモ予約帯からさらに離すための余裕。 */
const SAFETY_MARGIN_DAYS = 5;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** `DEFAULT_BUSINESS_HOURS_WEEK` は日曜のみ休業（`business-hours/defaults.ts`）。 */
const CLOSED_WEEKDAY = 0;

/** 探索の打ち切り。無限ループにせず、原因の分かるメッセージで落とす。 */
const MAX_SEARCH_DAYS = 60;

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/** `YYYY-MM-DD`（UTC 基準）。DayPicker の `data-day` と同じ表記。 */
export function formatUtcDateOnly(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isBookable(date: Date): boolean {
  if (date.getUTCDay() === CLOSED_WEEKDAY) return false;
  return !holidayJp.isHoliday(formatUtcDateOnly(date));
}

/**
 * 予約可能な日の `YYYY-MM-DD` を返す。
 *
 * @param weekday 曜日を固定したいとき（0=日〜6=土）。料金プランのように曜日条件を
 *   持つ検証で使う。省略時は最初に見つかった営業日。
 */
export function pickBookableDate(options?: {
  readonly weekday?: number;
}): string {
  const now = new Date();
  let candidate = addUtcDays(
    new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    ),
    SEED_RESERVATION_MAX_DAYS_OFFSET + SAFETY_MARGIN_DAYS,
  );

  const weekday = options?.weekday;
  if (weekday !== undefined) {
    candidate = addUtcDays(
      candidate,
      (weekday - candidate.getUTCDay() + 7) % 7,
    );
  }

  // 曜日固定なら週送り、そうでなければ日送りで最初の営業日を探す。
  const step = weekday === undefined ? 1 : 7;
  for (let i = 0; i <= MAX_SEARCH_DAYS; i += step) {
    const date = addUtcDays(candidate, i);
    if (isBookable(date)) return formatUtcDateOnly(date);
  }

  throw new Error(
    `[reservation-date] ${formatUtcDateOnly(candidate)} から ${String(MAX_SEARCH_DAYS)} 日以内に予約可能日が見つかりませんでした（weekday=${String(weekday)}）`,
  );
}

/**
 * `page.clock.install` に渡す固定時刻。
 *
 * 12:00 JST（= 03:00 UTC）に揃える。`events-calendar.spec.ts` と同じ anchor で、
 * ホスト側タイムゾーンによる日付境界のずれを避ける。
 */
export function bookableDateClockTime(dateOnly: string): Date {
  return new Date(`${dateOnly}T03:00:00.000Z`);
}
