/**
 * 必須テキストは `.trim()` を通してから `.min(1)` を課す。
 *
 * ## なぜ
 *
 * `z.string().min(1)` は空白 1 文字を通す。ユーザーが自由入力する項目でこれを
 * やると、**見た目が空の値が保存され、その先の副作用まで走る**。実測:
 * 公開問い合わせの `subject` / `message` は半角空白・全角空白・改行だけの送信が
 * 通り、管理者宛の通知メールまで飛んでいた。記事タイトル・FAQ の質問文・
 * スペース名など、管理画面の主要な CRUD も同じ状態だった。
 *
 * UI 側で `value.trim().length === 0` を見て送信ボタンを disabled にする対処は
 * **schema に無い保証を画面に置く**ことになる。実際 `inquiry-reply` は conform 化で
 * そのガードを落とした瞬間に空白送信が通るようになった（#1814）。判定は schema に
 * 置き、client / server の両方で同じ結果になるようにする。
 *
 * ## 走査範囲は `src/` 全体
 *
 * 配置で絞らない。`.claude/rules/forms-mutations.md` は schema の置き場を 3 つ
 * 挙げているが、**実際には 4 つ目**（`(dashboard)/_shared/lib/validations/` —
 * post / faq / news / space）があり、記事も FAQ もそこで定義されている。
 * 「規約に書かれた場所だけ見る」gate は、規約が追いついていない場所を丸ごと
 * 見逃す。これは検査したい性質であって配置の問題ではないので、`src/` を全部見る。
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
const SRC_ROOT = join(ROOT, "src");

/**
 * `.trim()` を課さない必須テキスト。キーは `src/` からの相対パス + `:` + フィールド名。
 *
 * **ユーザーが自由入力する項目は載せない。** 機械が生成する値・形式が別途
 * 検証される値だけを、理由付きで並べる。
 */
const NO_TRIM_ALLOWLIST = new Map<string, string>([
  // --- token / id: 空白混入は改ざんか不具合の徴候なので黙って直さない ---
  [
    "shared/lib/validations/event-registration.ts:token",
    "URL から渡る単発トークン",
  ],
  ["shared/lib/validations/review.ts:turnstileToken", "Turnstile が発行する値"],
  ["shared/lib/validations/sidebar.ts:id", "crypto.randomUUID() 由来の内部 ID"],
  [
    "app/(admin)/admin/(dashboard)/_shared/actions/editor-comment.ts:markId",
    "Lexical の mark ノードが持つ内部 ID",
  ],
  [
    "app/(admin)/admin/(dashboard)/_shared/lib/validations/space.ts:locationId",
    "select の値。後段の z.uuid() が形式を見る",
  ],
  [
    "app/(admin)/admin/(dashboard)/events/_components/event-form-schema.ts:categoryId",
    "同上",
  ],
  [
    "app/api/calendar/event/[registrationId]/route.ts:registrationId",
    "URL の path segment",
  ],

  // --- slug / 識別子: 別途 pattern 検証がある ---
  ["shared/lib/validations/location.ts:slug", "SLUG_REGEX が形式を見る"],
  ["shared/lib/validations/page.ts:slug", "同上"],
  ["app/(admin)/admin/(dashboard)/_shared/lib/validations/faq.ts:slug", "同上"],
  [
    "app/(admin)/admin/(dashboard)/_shared/lib/validations/post.ts:slug",
    "同上",
  ],
  [
    "app/(admin)/admin/(dashboard)/events/_components/event-form-schema.ts:slug",
    "同上",
  ],
  [
    "app/(admin)/admin/(dashboard)/posts/taxonomy/_components/taxonomy-schema.ts:slug",
    "同上",
  ],
  [
    "shared/lib/sections/definitions/location-list/schema.ts:slug",
    "参照先 Location の slug。人は打たない",
  ],
  [
    "app/(admin)/admin/(dashboard)/_shared/lib/validations/terms.ts:type",
    "`^[a-z0-9-]+$` を課す識別子",
  ],
  [
    "app/(admin)/admin/(dashboard)/_shared/actions/page-section.ts:type",
    "section registry の type 名",
  ],
  ["shared/lib/portable-text/schema.ts:name", "`IconXxx` 形式を課すアイコン名"],

  // --- そのまま保つことに意味がある値 ---
  [
    "shared/lib/validations/transfer-account.ts:expectedUpdatedAt",
    "ISO 日時文字列。楽観ロックの比較値",
  ],
  [
    "app/(admin)/admin/(dashboard)/_shared/actions/editor-comment.ts:quotedText",
    "本文から取った逐語の引用。trim すると引用範囲が変わる",
  ],
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

const SOURCE_EXTENSIONS = [".ts", ".tsx"];

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      out.push(...collectSourceFiles(p));
    } else if (SOURCE_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      out.push(p);
    }
  }
  return out;
}

/**
 * `<src からの相対パス>:<field>` → その名前で現れた必須 string のうち
 * `.trim()` が無い数。
 *
 * 同名フィールドは複数の schema に現れる（`post.ts` の `title` は 3 箇所）。
 * **1 つでも trim 無しがあれば違反**として扱いたいので、Map には最後に見た
 * 定義ではなく「trim 無しの件数」を入れる。
 */
function collectRequiredStrings(): Map<string, number> {
  const untrimmedCount = new Map<string, number>();

  for (const filePath of collectSourceFiles(SRC_ROOT)) {
    const fileName = relative(SRC_ROOT, filePath).split("\\").join("/");
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
