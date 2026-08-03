/**
 * アップロードされたファイル名の長さを DB 列に合わせて詰める純関数。
 *
 * `inquiry_attachments.filename` は `@db.VarChar(255)` で、書き込んでいるのは
 * multipart の `filename` パラメータ（= client が自由に決められる値）。PostgreSQL の
 * `varchar(n)` は溢れた値を黙って切らず `22001` を投げ、Prisma はそれを `DomainError`
 * ではない生の例外にするので、捕捉層に乗らず 500 になる。
 *
 * ## 拒否ではなく切り詰めにした理由
 *
 * ファイル名は**表示用のラベル**で、実体の識別子は R2 のキー側にある。中身が
 * 正しく上がっているアップロードを、飾りの欄が長いという理由で失敗させる方が損。
 * 切り詰めた結果は添付一覧にそのまま出るので利用者から見えない変化にもならない。
 *
 * ## 文字数の数え方（ここを間違えると壊れる）
 *
 * PostgreSQL の `varchar(n)` は **文字数**（コードポイント数）で数えるが、JS の
 * `String.length` は UTF-16 コードユニット数を返す。絵文字などのサロゲートペアでは
 * 後者が大きく出る。さらに素の `slice()` はペアの途中で切って**孤立サロゲート**を
 * 作りうる。これは不正な UTF-8 になるので、DB 側で改めて弾かれる。
 * したがってコードポイント単位（`[...name]`）で扱う。
 */

/**
 * `inquiry_attachments.filename` の `@db.VarChar(255)` に対応する上限。
 *
 * この値と列長が一致していることは
 * `__tests__/unit/architecture/varchar-write-bounds.test.ts` が schema.prisma と
 * 突き合わせる（片方だけ動かすと落ちる）。
 */
export const INQUIRY_ATTACHMENT_FILENAME_MAX_LENGTH = 255;

/**
 * `maxLength` 文字（コードポイント）以内に収める。拡張子は可能な限り残す。
 *
 * @param name ファイル名（client 供給の信用できない値）
 * @param maxLength 収めたい文字数。DB 列の `@db.VarChar(n)` の n
 */
export function truncateFilename(name: string, maxLength: number): string {
  if (maxLength <= 0) return "";

  const chars = [...name];
  if (chars.length <= maxLength) return name;

  // 先頭のドットは拡張子ではない（`.gitignore` のような名前を守る）
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? [...name.slice(dot)] : [];

  // 拡張子だけで枠を使い切るなら、素直に先頭から詰める
  if (extension.length === 0 || extension.length >= maxLength) {
    return chars.slice(0, maxLength).join("");
  }

  const stem = chars.slice(0, maxLength - extension.length);
  return stem.join("") + extension.join("");
}
