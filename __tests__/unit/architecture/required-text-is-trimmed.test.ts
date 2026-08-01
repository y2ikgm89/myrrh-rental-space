/**
 * 必須テキストは `.trim()` を通してから `.min(1)` を課す。
 *
 * ## なぜ
 *
 * `z.string().min(1)` は空白 1 文字を通す。ユーザーが自由入力する項目でこれを
 * やると、**見た目が空の値が保存され、その先の副作用まで走る**。実測:
 * 公開問い合わせの `subject` / `message` は半角空白・全角空白・改行だけの送信が
 * 通り、管理者宛の通知メールまで飛んでいた。顧客プロフィールの姓名も同様。
 *
 * UI 側で `value.trim().length === 0` を見て送信ボタンを disabled にする対処は
 * **schema に無い保証を画面に置く**ことになる。実際 `inquiry-reply` は conform 化で
 * そのガードを落とした瞬間に空白送信が通るようになった（#1814）。判定は schema に
 * 置き、client / server の両方で同じ結果になるようにする。
 *
 * ## 対象外
 *
 * ID / token / slug / 日時のような **機械が生成する値**は、空白混入自体が
 * 別の異常なので `.trim()` で救わない（下の allowlist に理由付きで登録する）。
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const VALIDATIONS_ROOT = join(ROOT, "src", "shared", "lib", "validations");

/**
 * `.trim()` を課さない必須テキスト。
 *
 * **ユーザーが自由入力する項目は載せない。** 機械が生成する値・形式が別途
 * 検証される値だけを、理由付きで並べる。
 */
const NO_TRIM_ALLOWLIST = new Map<string, string>([
  [
    "event-registration.ts:token",
    "URL から渡る単発トークン。空白混入は改ざんの徴候なので黙って直さない",
  ],
  ["review.ts:turnstileToken", "Turnstile が発行する値。人は打たない"],
  ["sidebar.ts:id", "crypto.randomUUID() 由来の内部 ID"],
  ["location.ts:slug", "slug は別途 pattern 検証がある"],
  ["page.ts:slug", "同上"],
  [
    "transfer-account.ts:expectedUpdatedAt",
    "ISO 日時文字列。楽観ロックの比較値",
  ],
  ["location.ts:value", "営業時間などの構造化値。呼び出し側で形式検証する"],
  ["location.ts:imageUrl", "URL。別途 safe-href 系で検証する"],
]);

/**
 * `name: z.string()....min(1` を拾う。チェーンは改行を跨ぐので dotAll。
 * `.max()` や `{ error: … }` を挟んでいても順序は問わない。
 *
 * **拾えないもの**: `const base = z.string()` を経由して `base.min(1)` と書く形。
 * `z.string()` が field 名の直後に来る書き方だけを見る。この repo の schema は
 * 全てその形なので今は取りこぼしが無いが、間接参照を足すならここも直す。
 */
const REQUIRED_STRING_FIELD =
  /(\w+):\s*z\s*\.string\(\)((?:\s*\.\w+\([^()]*(?:\([^()]*\)[^()]*)*\))*)/gsu;

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      out.push(...collectTsFiles(p));
    } else if (entry.endsWith(".ts")) {
      out.push(p);
    }
  }
  return out;
}

/**
 * `<file>:<field>` → その名前で現れた必須 string のうち `.trim()` が無い数。
 *
 * 同名フィールドは複数の schema に現れる（`page.ts` の `title` など）。
 * **1 つでも trim 無しがあれば違反**として扱いたいので、Map には
 * 最後に見た定義ではなく「trim 無しの件数」を入れる。
 */
function collectRequiredStrings(): Map<string, number> {
  const untrimmedCount = new Map<string, number>();

  for (const filePath of collectTsFiles(VALIDATIONS_ROOT)) {
    const fileName = relative(VALIDATIONS_ROOT, filePath).split("\\").join("/");
    const source = readFileSync(filePath, "utf8");

    for (const match of source.matchAll(REQUIRED_STRING_FIELD)) {
      const field = match[1] ?? "";
      const chain = match[2] ?? "";
      if (!chain.includes(".min(1")) continue;

      const key = `${fileName}:${field}`;
      const previous = untrimmedCount.get(key) ?? 0;
      untrimmedCount.set(key, previous + (chain.includes(".trim()") ? 0 : 1));
    }
  }

  return untrimmedCount;
}

describe("required text fields are trimmed", () => {
  test("`.min(1)` を課す string は `.trim()` も通している", () => {
    const violations = [...collectRequiredStrings()]
      .filter(
        ([key, untrimmed]) => untrimmed > 0 && !NO_TRIM_ALLOWLIST.has(key),
      )
      .map(([key]) => key);

    expect(violations).toEqual([]);
  });

  test("allowlist に死んだ entry が残っていない", () => {
    const untrimmedCount = collectRequiredStrings();

    // entry が要るのは「今も trim 無しで存在する」場合だけ。フィールドが消えても、
    // `.trim()` が入って例外が不要になっても、entry は残骸になる。
    const stale = [...NO_TRIM_ALLOWLIST.keys()].filter(
      (key) => (untrimmedCount.get(key) ?? 0) === 0,
    );

    expect(stale).toEqual([]);
  });
});
