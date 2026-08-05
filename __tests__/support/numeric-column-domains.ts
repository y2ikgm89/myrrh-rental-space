/**
 * 数値列の値域の宣言（SSoT）。
 *
 * `20260805130000_numeric_column_domains` が DB に入れた CHECK と 1 対 1 に対応する。
 * ここを直しただけでは DB は変わらないし、DB を直しただけでもここは変わらない —
 * **ずれたら落ちる**ように 2 本のテストが両側から突き合わせる:
 *
 *   - `__tests__/unit/architecture/numeric-column-domains.test.ts`
 *     すべての数値列が「CHECK に覆われている」か「覆わない理由が宣言されている」かの
 *     どちらかであること（網羅）
 *   - `__tests__/integration/prisma/numeric-column-domains.test.ts`
 *     宣言した境界値が**実 DB の述語で**通る/弾かれること（挙動）
 *
 * 網羅だけだと「CHECK はあるが述語が違う」を見逃し、挙動だけだと「列が増えたのに
 * 誰も見ていない」を見逃す。
 */

import { readPrismaSchema } from "./prisma-sources";

export interface NumericColumn {
  readonly model: string;
  readonly field: string;
  readonly table: string;
  readonly column: string;
}

/** `@map` が無いときの物理名。命名規約 gate が全列でこの等式を強制している。 */
function snakeCase(name: string): string {
  return name.replaceAll(/(?<!^)(?=[A-Z])/gu, "_").toLowerCase();
}

/**
 * schema.prisma の Int / Float / Decimal 列を物理名つきで集める。
 *
 * **単一実装にする。** unit 側と integration 側で別々にパースすると、片方だけが
 * 壊れたときに両者の食い違いが「対象 0 件」として静かに通る。integration 側は
 * ここで導いた物理名が `information_schema` に実在することを確かめて裏を取る。
 *
 * CRLF で checkout されたツリーでも列を取りこぼさないよう `/\r?\n/` で割る
 * （varchar gate で一度これに嵌まっている）。
 */
export function readNumericColumns(): NumericColumn[] {
  const lines = readPrismaSchema().split(/\r?\n/u);

  const tableOf = new Map<string, string>();
  {
    let model: string | null = null;
    for (const raw of lines) {
      const line = raw.replace(/\/\/.*$/u, "");
      const open = /^\s*model\s+(\w+)\s*\{/u.exec(line);
      if (open?.[1]) {
        model = open[1];
        tableOf.set(model, model);
        continue;
      }
      if (/^\s*\}/u.test(line)) {
        model = null;
        continue;
      }
      if (!model) continue;
      const mapped = /@@map\("([^"]+)"\)/u.exec(line);
      if (mapped?.[1]) tableOf.set(model, mapped[1]);
    }
  }

  const out: NumericColumn[] = [];
  let model: string | null = null;
  for (const raw of lines) {
    const line = raw.replace(/\/\/.*$/u, "");
    const open = /^\s*model\s+(\w+)\s*\{/u.exec(line);
    if (open?.[1]) {
      model = open[1];
      continue;
    }
    if (/^\s*\}/u.test(line)) {
      model = null;
      continue;
    }
    if (!model) continue;

    const decl = /^\s*(\w+)\s+(Int|Float|Decimal)(\[\])?\??\s*(.*)$/u.exec(
      line,
    );
    if (!decl?.[1]) continue;
    // スカラー配列は要素ごとの値域を CHECK で書けないので対象外
    // （現状 schema に数値配列は 1 本も無い。増えたら自己検査が気づく）。
    if (decl[3] === "[]") continue;
    const mapped = /@map\("([^"]+)"\)/u.exec(decl[4] ?? "");

    out.push({
      model,
      field: decl[1],
      table: tableOf.get(model) ?? model,
      column: mapped?.[1] ?? snakeCase(decl[1]),
    });
  }
  return out;
}

/** `Model.field` の形。宣言テーブルのキーと同じ綴り。 */
export function columnKey(c: NumericColumn): string {
  return `${c.model}.${c.field}`;
}

/**
 * PostgreSQL の識別子上限（バイト）。
 *
 * **超えた分は黙って切り捨てられる。** エラーも警告も出ないので、長い名前は
 * 「付けたつもりの名前と実際の名前が違う」状態を作る。実際 20260805130000 の
 * 初版が 2 本これを踏み、`pg_constraint` 側では 63 バイトに切られていた。
 */
export const POSTGRES_IDENTIFIER_MAX_BYTES = 63;

/**
 * 既定の `<表>_<列>_<種別>_check` が 63 バイトに収まらない列の短縮名。
 *
 * 表名と列名で語が重複している（`settings_google_calendar` の
 * `google_calendar_reminder_minutes`）ケースだけ。重複を落として短くしてある。
 * **勝手に足せない** — 下の長さ検査が「収まらないのに override が無い」を落とし、
 * 逆に「収まるのに override がある」も落とす。
 */
const CONSTRAINT_NAME_OVERRIDES: Readonly<Record<string, string>> = {
  "SettingsGoogleCalendar.googleCalendarReminderMinutes":
    "settings_google_calendar_reminder_minutes_non_negative_check",
  "SettingsSwitchbot.switchbotPasscodeBufferMinutes":
    "settings_switchbot_passcode_buffer_minutes_non_negative_check",
};

/** override を使わずに導いた既定名。長さ検査用。 */
export function defaultConstraintNameFor(
  c: NumericColumn,
  domain: NumericDomain,
): string {
  return `${c.table}_${c.column}_${constraintSuffix(domain)}`;
}

/** 値域の宣言から、migration が付けた制約名を導く。 */
export function constraintNameFor(
  c: NumericColumn,
  domain: NumericDomain,
): string {
  return (
    CONSTRAINT_NAME_OVERRIDES[columnKey(c)] ??
    defaultConstraintNameFor(c, domain)
  );
}

export function constraintNameOverrideKeys(): readonly string[] {
  return Object.keys(CONSTRAINT_NAME_OVERRIDES);
}

/**
 * 並び替えが一時退避に使う値の上限（この値以下が scratch space）。
 *
 * `src/shared/domain/order-sql.ts` の `TEMP_ORDER_BASE` と同じ値でなければならない。
 * 一致は `numeric-column-domains.test.ts` が **order-sql.ts の実ソースを読んで**
 * 突き合わせる（片方だけ動くと落ちる）。
 */
export const REORDER_SCRATCH_CEILING = -1_000_000;

export type NumericDomain =
  | { readonly kind: "range"; readonly min: number; readonly max: number }
  /** 0 では意味を成さない（幅・所要分・件数上限）。 */
  | { readonly kind: "positive" }
  /** 0 は正当（カウンタ・金額・サイズ）。 */
  | { readonly kind: "nonNegative" }
  /**
   * 並び順の位置。**`>= 0` にはできない。**
   *
   * 負値が正当に使われる場面が 2 つある:
   *
   *   1. **並び替えの退避領域**。unique な order 列は 0 ↔ 1 の直接交換ができないため、
   *      reorder は全対象を `TEMP_ORDER_BASE - index` へ逃がしてから最終値を当てる
   *      （`src/shared/domain/order-sql.ts`）。素の `>= 0` を付けると
   *      **並び替えが 23514 で落ちる**（実測: reorder 系 12 ファイルが赤くなった）
   *   2. **固定先頭の番兵**。`page-hero` は `order = -1` 固定でドラッグ対象外
   *      （`src/shared/domain/sections/commands.ts`）。これも実測で seed が落ちた
   *
   * そこで「実際の位置（`min` 以上）」と「退避領域」の 2 領域だけを許し、
   * その間を弾く。`min` は既定 0 で、番兵を持つ列だけが下げる。
   */
  | { readonly kind: "position"; readonly min: number };

const range = (min: number, max: number): NumericDomain => ({
  kind: "range",
  min,
  max,
});
const positive: NumericDomain = { kind: "positive" };
const nonNegative: NumericDomain = { kind: "nonNegative" };
/**
 * 並び順の位置。`pinnedMin` は固定先頭の番兵が使う下限（既定 0 = 番兵なし）。
 * 下げてよいのは実際に番兵を書くコードがある列だけで、その根拠は
 * `numeric-column-domains.test.ts` がソースから確かめる。
 */
const position = (pinnedMin = 0): NumericDomain => ({
  kind: "position",
  min: pinnedMin,
});

/**
 * `Model.field` → 値域。
 *
 * **アプリ（Zod）より狭くしない。** 狭いと今まで通っていた入力が DB の生エラーに
 * なり、利用者には理由の分からない失敗として出る。ここに載る値は Zod の上下限を
 * 含む最小の常識的な範囲に留める。
 */
export const NUMERIC_COLUMN_DOMAINS: Readonly<Record<string, NumericDomain>> = {
  // --- 物理・法的に決まる範囲 -------------------------------------------
  "Location.latitude": range(-90, 90), // WGS84
  "Location.longitude": range(-180, 180), // WGS84
  "SpaceReview.rating": range(1, 5), // 星の数
  "SettingsCommerce.taxStandardRate": range(0, 100),
  "SettingsCommerce.taxReducedRate": range(0, 100),
  "SmartLockDevice.lastBattery": range(0, 100), // SwitchBot の電池残量 %
  "ReceiptSequence.year": range(2000, 9999), // 4 桁年

  // --- 0 が意味を成さないもの -------------------------------------------
  "ReservationSeries.duration": positive,
  "ReservationSeries.instanceCount": positive,
  "SettingsAnnouncementCarousel.duration": positive,
  "SettingsLayout.containerWidthCustom": positive,
  "SettingsLayout.contentWidthCustom": positive,
  "News.contentWidthCustom": positive,
  "Post.contentWidthCustom": positive,
  "SettingsSidebar.sidebarRecentCount": positive,
  "SettingsSidebar.sidebarPopularCount": positive,
  "SettingsReservation.defaultTimeSlot": positive,
  "SettingsReservation.minReservationDuration": positive,
  "SettingsReservation.maxReservationDuration": positive,
  "SettingsReservation.maxRecurrenceInstances": positive,
  "SettingsReservation.cancellationDeadlineHours": positive,
  "SettingsReservation.modificationDeadlineHours": positive,
  "ReceiptSequence.nextNo": positive, // 1-indexed

  // --- 並び順の位置（退避領域つき） ---------------------------------
  "Location.sortOrder": position(),
  "SpaceCategory.sortOrder": position(),
  "AnnouncementBar.displayOrder": position(),
  "PostCategory.order": position(),
  "Section.order": position(-1), // page-hero が固定先頭に使う番兵
  "NavigationItem.order": position(),
  "SocialLink.order": position(),
  "FaqCategory.order": position(),
  "FaqItem.order": position(),
  "InstagramPost.sortOrder": position(),
  "TermsDocument.displayOrder": position(),
  "EventCategory.sortOrder": position(),
  "EventTicket.sortOrder": position(),
  "TransferAccount.sortOrder": position(),

  // --- 非負 --------------------------------------------------------------
  "Reservation.version": nonNegative,
  "Reservation.icsSequence": nonNegative,
  "Reservation.recurrenceInstanceIndex": nonNegative,
  "Customer.totalReservations": nonNegative,
  "Customer.totalSpent": nonNegative,
  "InquiryAttachment.sizeBytes": nonNegative,
  "Post.viewCount": nonNegative,
  "FaqItem.viewCount": nonNegative,
  "FaqItem.helpfulCount": nonNegative,
  "FaqItem.notHelpfulCount": nonNegative,
  "SettingsGoogleCalendar.googleCalendarReminderMinutes": nonNegative,
  "SettingsSwitchbot.switchbotPasscodeBufferMinutes": nonNegative,
  "Media.size": nonNegative,
  "Media.width": nonNegative, // 画像以外（PDF 等）は 0
  "Media.height": nonNegative,
  "EventRegistration.icsSequence": nonNegative,
  "EventRegistration.paidAmount": nonNegative,
  "Receipt.revision": nonNegative,
};

/**
 * 値域を持たせない数値列と、その理由。
 *
 * **空であるべきリスト。** 数値列に「どんな値でもよい」はほぼ無い。ここに足すのは
 * 「範囲を決めると正しいデータを弾く」と言い切れるときだけで、理由には
 * **弾いてしまう実例**を書くこと。「今は要らない」は理由にならない。
 */
export const UNBOUNDED_NUMERIC_COLUMNS: Readonly<Record<string, string>> = {};

/**
 * 値域の境界。`accepted` は通らなければならない値、`rejected` は弾かれなければ
 * ならない値。
 *
 * **両方を見る。** `rejected` だけだと `CHECK (false)` でも緑になり、
 * `accepted` だけだと `CHECK (true)` でも緑になる。
 */
export function boundaryValues(domain: NumericDomain): {
  readonly accepted: readonly number[];
  readonly rejected: readonly number[];
} {
  switch (domain.kind) {
    case "range":
      return {
        accepted: [domain.min, domain.max],
        rejected: [domain.min - 1, domain.max + 1],
      };
    case "positive":
      return { accepted: [1], rejected: [0, -1] };
    case "nonNegative":
      return { accepted: [0], rejected: [-1] };
    case "position":
      // 実際の位置（下限ちょうど）と退避領域（上限ちょうど / さらに下）は通り、
      // その間（下限のすぐ下 / 退避上限のすぐ上）は弾かれる。
      return {
        accepted: [
          domain.min,
          0,
          REORDER_SCRATCH_CEILING,
          REORDER_SCRATCH_CEILING - 5,
        ],
        rejected: [domain.min - 1, REORDER_SCRATCH_CEILING + 1],
      };
  }
}

/** 値域から migration が付けた制約名を導く。 */
export function constraintSuffix(domain: NumericDomain): string {
  switch (domain.kind) {
    case "range":
      return "range_check";
    case "positive":
      return "positive_check";
    case "nonNegative":
      return "non_negative_check";
    case "position":
      return "position_check";
  }
}
