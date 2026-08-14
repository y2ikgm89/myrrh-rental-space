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
 * どちらの導出も、DayPicker が各セルに付ける安定属性 `data-day="YYYY-MM-DD"` で
 * 選択する前提。アクセシブルネームはロケール依存（例「2026年8月21日金曜日」）
 * なので使わない。**時計の扱いは送信するかどうかで逆になる**:
 *
 * - **送信しない** spec — `pickBookableDate()` の返り値を
 *   `page.clock.install({ time: bookableDateClockTime(...) })` の起点にする
 * - **送信する** spec — `pickBookableDateInNextMonth()` を使い、時計は固定しない
 *   （理由は `bookableDateClockTime` の JSDoc）。カレンダーは 1 回翌月へ送る
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
 * **翌月**の最初の予約可能日を返す（`YYYY-MM-DD`）。
 *
 * フォームを実際に送信する spec 用。時計を固定できないので
 * （`bookableDateClockTime` の注記参照）、カレンダーは**実時刻の月**を描く。
 * 翌月へ 1 回送れば、条件分岐なしに必ず未来の日付が選べる:
 *
 * - 翌月は全体が未来なので `publicReservationSchema` の日付 refine を必ず通る
 * - 月末に「今月の残りに営業日が無い」ような境界を踏まない
 * - 条件付きロケーター（`if (await x.count() > 0)`）は ESLint で禁止なので、
 *   「見つからなければ月送り」という形は採れない。**常に 1 回送る**のが規約に合う
 */
export function pickBookableDateInNextMonth(): string {
  // 「今が何月か」だけは**ローカル時計**で決める。カレンダーの表示月は DayPicker の
  // `today` 既定（= ブラウザの `new Date()`）で決まるので、UTC で数えると
  // TZ=UTC 以外のホストでは月境界の数時間だけ 1 ヶ月ずれて月送りが空振りする。
  // 日付の組み立て自体は他の helper と同じく UTC 基準に揃える。
  const now = new Date();
  const firstOfNextMonth = new Date(
    Date.UTC(now.getFullYear(), now.getMonth() + 1, 1),
  );

  for (let i = 0; i <= MAX_SEARCH_DAYS; i++) {
    const date = addUtcDays(firstOfNextMonth, i);
    if (date.getUTCMonth() !== firstOfNextMonth.getUTCMonth()) break;
    if (isBookable(date)) return formatUtcDateOnly(date);
  }

  throw new Error(
    `[reservation-date] ${formatUtcDateOnly(firstOfNextMonth)} の月に予約可能日が見つかりませんでした`,
  );
}

/**
 * `page.clock.install` に渡す固定時刻。
 *
 * 12:00 JST（= 03:00 UTC）に揃える。`events-calendar.spec.ts` と同じ anchor で、
 * ホスト側タイムゾーンによる日付境界のずれを避ける。
 *
 * **フォームを送信する spec では時計を固定してはいけない。** 実害が 2 つあり、
 * どちらも #1823 の CI で 1 回ずつ観測されている。
 *
 * 1. **Turnstile が解けない。** `clock.install` は時間を止めるので、widget の
 *    challenge が進まず hidden input が空のままになる（実測 run 30728829959:
 *    `expect(locator).not.toHaveValue("")` が 20 秒待って失敗）
 * 2. ~~**bot 判定に落ちる。**~~ 監査 F-71 で解消済み（`formRenderToken` はサーバーが
 *    発行し、サーバー自身の時計とだけ突き合わせる）。以下は当時の記録:
 *    `ReservationForm` は `useState(() => Date.now())` で
 *    `formRenderedAt` を**ブラウザの時計**から焼き込む。これは step 3 ではなく
 *    **フォームの初回マウント時**、つまり日付を選ぶより前に確定する。Server Action の
 *    `checkBotHeuristics` はそれをサーバーの実時刻と引き算する
 *    （`Date.now() - formRenderedAt >= 3000ms`）ので、未来へ固定していると差が負に
 *    なり全送信が弾かれる（実測 run 30731786539: step 3 に「セキュリティ検証に
 *    失敗しました」が出たまま完了 URL に到達せず timeout）
 *
 * 2 に対して途中で `setSystemTime` に戻しても遅い — 値はもう焼かれている。
 * 送信する spec は `pickBookableDateInNextMonth()` + 月送りを使うこと。
 */
export function bookableDateClockTime(dateOnly: string): Date {
  return new Date(`${dateOnly}T03:00:00.000Z`);
}
