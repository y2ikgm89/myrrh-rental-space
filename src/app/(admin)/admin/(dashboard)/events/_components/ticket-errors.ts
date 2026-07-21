/**
 * TicketsField エラー配線ヘルパー。
 *
 * tickets は JSON 文字列 hidden input で transit する（`event-form-schema.ts` の
 * `ticketsSchema`）ため、conform は入力ごとの sub-field を持たない。ただし
 * `parseWithZod` は Zod issue の `path` を conform 命名 (`tickets[0].capacity` 等) に
 * 変換して `form.error` に格納するため、`fields.tickets.allErrors` から prefix filter
 * された Record<string, string[]> を受け取り、行 index + 列名で lookup する形に
 * 束ね直すことで per-row 表示が可能になる。
 *
 * Option (b) — hidden JSON 契約を保ったまま UI 側で per-row 配線するアプローチ。
 * Option (a) (`getFieldList()` 化) と違い schema / submit ハンドラを触らないため
 * 影響範囲が TicketsField.tsx + EventForm.tsx 2 箇所で閉じる。
 */

/** conform の allErrors 由来 error map。null は VALIDATION_SKIPPED 用の予約値。 */
export type FieldErrorMap = Readonly<
  Record<string, readonly string[] | null | undefined>
>;

const TICKET_INDEXED_PATTERN = /^tickets\[(\d+)\](?:\.([A-Za-z_][\w]*))?$/;

/**
 * `tickets[0].capacity` などの conform 命名 key を、行 index + 列名で参照するための
 * ネスト map に組み直す。`tickets` (top-level, min(1) 等) は含めない。
 *
 * @example
 * groupTicketFieldErrors({
 *   "tickets[0].capacity": ["区分が複数のときは枠数を入力してください"],
 *   "tickets[1].name": ["チケット名は必須です"],
 *   "tickets": ["区分を少なくとも1つ登録してください"],
 * })
 * // → Map(
 * //     0 => { capacity: ["区分が..."] },
 * //     1 => { name: ["チケット名..."] }
 * //   )
 */
export function groupTicketFieldErrors(
  fieldErrors: FieldErrorMap | undefined,
): ReadonlyMap<number, Readonly<Record<string, readonly string[]>>> {
  const result = new Map<number, Record<string, readonly string[]>>();
  if (!fieldErrors) return result;

  for (const [key, messages] of Object.entries(fieldErrors)) {
    if (!messages || messages.length === 0) continue;
    const match = TICKET_INDEXED_PATTERN.exec(key);
    if (!match) continue;
    const [, indexStr, field] = match;
    if (indexStr === undefined) continue;
    const index = Number(indexStr);
    if (!Number.isInteger(index) || index < 0) continue;
    // 行そのものへの issue (path=["tickets", N]) は "__row__" に割り当てる。
    // 通常のフィールドエラーは field 名で直接 lookup できる。
    const bucketKey = field ?? "__row__";
    const existing = result.get(index) ?? {};
    existing[bucketKey] = messages;
    result.set(index, existing);
  }
  return result;
}

/**
 * `fields.tickets.allErrors` から top-level `"tickets"` バケット (min(1) 等の
 * 配列全体エラー) のみを取り出す。行 index を含む key は捨てる。
 */
export function selectTicketsArrayErrors(
  fieldErrors: FieldErrorMap | undefined,
): readonly string[] | undefined {
  const value = fieldErrors?.["tickets"];
  return value && value.length > 0 ? value : undefined;
}

/**
 * `fields.tickets.allErrors` の中に何らかの実エラー (null/空配列を除く) があるかを返す。
 * EventForm の Tab バッジ count に使う。
 */
export function countTicketFieldErrorGroups(
  fieldErrors: FieldErrorMap | undefined,
): number {
  if (!fieldErrors) return 0;
  let count = 0;
  for (const messages of Object.values(fieldErrors)) {
    if (messages && messages.length > 0) count += 1;
  }
  return count;
}
