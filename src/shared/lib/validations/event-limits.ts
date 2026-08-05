/**
 * イベントの文字列欄の上限。**列長とフォームの両方がここを見る。**
 *
 * 別々に書いていると、片方だけ動いたときに「入力は通るのに保存で落ちる」が生まれる。
 * `events.title` / `events.slug` の列長と一致していることは
 * `__tests__/unit/architecture/varchar-write-bounds.test.ts` が機械強制する。
 */

export const EVENT_TITLE_MAX_LENGTH = 200;

export const EVENT_SLUG_MAX_LENGTH = 100;

/**
 * `ensureUniqueSlug` が衝突時に足す連番（`-2` … `-999`）のために空けておく文字数。
 *
 * 空けずに上限いっぱいの slug を作ると、**2 件目を作った瞬間に 22001 で落ちる**。
 * 落ちるのは「イベントを複製する」「同じ slug で作る」という普通の操作。
 */
export const EVENT_SLUG_SEQUENCE_RESERVE = 4;

/** 複製 slug のベースに使える最大長（連番ぶんを引いたもの）。 */
export const EVENT_SLUG_BASE_MAX_LENGTH =
  EVENT_SLUG_MAX_LENGTH - EVENT_SLUG_SEQUENCE_RESERVE;
