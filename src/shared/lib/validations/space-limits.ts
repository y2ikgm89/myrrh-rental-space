/**
 * スペースの文字列欄の上限。**フォームの Zod と複製コマンドの両方がここを見る。**
 *
 * `spaces.name` / `spaces.slug` は Text 列なので DB の 22001 にはならない。
 * 実害は Zod の `.max()` が以後の編集を全部ブロックすること
 * （上限いっぱいのスペースを複製すると name/slug が溢れ、価格だけ直そうとしても保存できない）。
 *
 * 上限が一致していることは
 * `__tests__/unit/architecture/derived-value-varchar-writes.test.ts` が
 * Text 列も含めて機械強制する。
 */

export const SPACE_NAME_MAX_LENGTH = 100;

export const SPACE_SLUG_MAX_LENGTH = 100;

/**
 * `ensureUniqueSlug` が衝突時に足す連番（`-2` … `-999`）のために空けておく文字数。
 */
export const SPACE_SLUG_SEQUENCE_RESERVE = 4;

/** 複製 slug のベースに使える最大長（連番ぶんを引いたもの）。 */
export const SPACE_SLUG_BASE_MAX_LENGTH =
  SPACE_SLUG_MAX_LENGTH - SPACE_SLUG_SEQUENCE_RESERVE;
