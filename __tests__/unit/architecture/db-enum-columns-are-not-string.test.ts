/**
 * DB の enum に裏打ちされた列を、TS 側で `string` と宣言していないか。
 *
 * ## なぜ要るのか
 *
 * `string` と宣言すると、**値域が動いてもコンパイラが何も言わなくなる**。
 * `string` と文字列リテラルの比較は合法だからで、`=== "connected"` は型検査を
 * 素通りする。
 *
 * 実害の記録（20260805100000 の直後、Codex #1937 が指摘）:
 *
 * | 場所 | 宣言 | 起きたこと |
 * | --- | --- | --- |
 * | `settings/types.ts` の `stripeConnectionStatus` | `string \| null` | 接続済みの Stripe が**エラー表示**になる |
 * | `settings/types.ts` の `googleCalendarConnectionStatus` | `string \| null` | 同上 |
 * | `admin-queries.ts` の `parseCalendarConnectionStatus(value: string \| null)` | `string \| null` | パーサが常に null を返し、**カレンダー連携と双方向同期が無言で止まる** |
 *
 * 値を大文字へ寄せる migration を書いた時点で、これらは全部壊れていた。**型検査も
 * 生 SQL ゲートも何も言わなかった。** 直す前に `string` を enum へ変えたところ、
 * コンパイラが 8 箇所を正確に指した — 型が正しければ探す必要は無い。
 *
 * ## 判定
 *
 * schema.prisma で enum 型の列を集め、その field 名が TS の型宣言で `string` に
 * なっている箇所を違反とする。**enum 型そのものを使えば型検査が働く。**
 *
 * 同名の別概念を巻き込みうるので、`AMBIGUOUS_FIELD_NAMES` に理由付きで登録できる。
 * ただし「たまたま同じ名前」以外の理由で載せない — `string` にしたい理由が
 * あるなら、それは値域が enum で表せていないという設計の話になる。
 *
 * ## 既存分は ratchet で扱う
 *
 * ConnectionStatus を直した時点で同じ形が **30 件**残っていた。1 つの PR に
 * 無関係な変更を大量に混ぜないため、出発点を凍結して減らす方向にだけ動かす。
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { readPrismaSchema } from "../../support/prisma-sources";

/**
 * `string` 宣言を許す field 名と、その理由。
 *
 * **「同名の別概念」以外を載せない。**
 */
const AMBIGUOUS_FIELD_NAMES: ReadonlyMap<string, string> = new Map([
  [
    "type",
    "汎用すぎる。Media / BlockedDate / Coupon など多数のモデルが持ち、UI の union 型・discriminated union の判別子・HTML の input type とも衝突する",
  ],
  [
    "status",
    "同上。Prisma enum の status と、Server Action の submission status / fetch の status が同名で共存する",
  ],
  [
    "scope",
    "OAuth の scope（Account.scope は enum ではない素の文字列）と BlockedDate.scope が同名",
  ],
  ["role", "Prisma の Role enum と ARIA role が同名"],
  ["format", "Prisma の EventFormat と、日付フォーマット指定の文字列が同名"],
]);

/**
 * **DB 列ではない**もの。名前がたまたま enum 列と一致しているだけ。
 *
 * ratchet ではなく恒久的な除外なので、**別の一覧にする**。混ぜると「いつか直る」
 * ように見えて、実際には永遠に減らない entry がベースラインに居座る。
 */
const NOT_A_DB_COLUMN: ReadonlyMap<string, string> = new Map([
  [
    "src/shared/lib/turnstile.ts::action",
    "Cloudflare Turnstile の検証応答（`VerifyTurnstileResult`）。値域は Cloudflare が決めるので AuditAction とは無関係",
  ],
  [
    "src/shared/domain/instagram/types.ts::accountType",
    "Instagram Graph API のアカウント種別（`InstagramConfig`）。TransferAccount.accountType（口座種別）とは無関係",
  ],
  [
    "src/shared/lib/instagram/index.ts::accountType",
    "同上（`InstagramUserInfo`）。Instagram が返す値",
  ],
  [
    "src/shared/domain/instagram/commands.ts::accountType",
    "同上。API のテスト結果 metadata から取り出した値",
  ],
  [
    "src/shared/lib/smart-lock/switchbot-client.ts::deviceType",
    "SwitchBot API のデバイス一覧応答（`SwitchBotDeviceListItem`）。SwitchBot が返す任意のデバイス種別で、こちらの SmartLockDeviceType は取り扱う分だけを列挙した狭い集合",
  ],
]);

/**
 * **DB 列ではなくフォーム / URL の値**なので enum 型で受けられない箇所。
 *
 * 未選択を `""` で表す（`<select>` の空 option / クエリパラメータの欠落）ので、
 * 取りうる値は `LayoutWidth | ""` のような別の集合になる。DB の enum をそのまま
 * 当てると「未選択」が表現できず、正しい入力が型エラーになる。
 *
 * **`NOT_A_DB_COLUMN` とは別物。** あちらは「同じ名前の別概念」で、こちらは
 * 「同じ概念だが、まだ narrow されていない層にいる」。narrow は入力の境界
 * （schema / searchParams のパース）で行い、その先は enum 型で流す。
 */
const FORM_OR_URL_VALUE: ReadonlyMap<string, string> = new Map([
  [
    "src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/content-types/types.ts::contentWidth",
    'サイドパネルのフォーム値。未選択が ""',
  ],
  [
    "src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/hooks/use-news-editor.ts::contentWidth",
    '同上。フォーム初期値を "" で組む',
  ],
  [
    "src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/hooks/use-post-editor.ts::contentWidth",
    "同上",
  ],
  [
    "src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/side-panel/LayoutFields.tsx::contentWidth",
    '同上。`DEFAULT` を "" に読み替えて <select> に渡す',
  ],
  [
    "src/app/(admin)/admin/(dashboard)/_shared/types/media-picker.ts::usage",
    'メディアピッカーの絞り込み。未指定が ""',
  ],
  [
    "src/app/(admin)/admin/(dashboard)/media/_components/MediaDetailDialog.tsx::usage",
    "同上（表示用の props）",
  ],
  [
    "src/app/(admin)/admin/(dashboard)/media/_components/MediaListWrapper.tsx::usage",
    "同上（searchParams 由来）",
  ],
]);

const ROOTS = ["src"] as const;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.tsx?$/u.test(entry.name) ? [path] : [];
  });
}

const schema = readPrismaSchema();

/** schema.prisma で enum 型が付いている列の field 名。 */
function enumBackedFieldNames(): Set<string> {
  const enumNames = new Set(
    [...schema.matchAll(/^enum (\w+) \{/gmu)].map((m) => m[1] ?? ""),
  );
  const out = new Set<string>();
  for (const match of schema.matchAll(/^model \w+ \{([\s\S]*?)^\}/gmu)) {
    const body = match[1];
    if (body === undefined) continue;
    for (const line of body.split(/\r?\n/u)) {
      const column = /^ {2}(\w+)\s+(\w+)/u.exec(line);
      if (!column) continue;
      const [, field, type] = column;
      if (field === undefined || type === undefined) continue;
      if (enumNames.has(type)) out.add(field);
    }
  }
  return out;
}

const enumFields = enumBackedFieldNames();

/**
 * `field: string` / `field: string | null` 形の宣言の**件数**。
 * 関数引数もこの形で書かれるので同じ正規表現で拾える。
 *
 * **有無ではなく件数を数える。** 同じファイルの同じ field に 2 つ目の `string`
 * 宣言を足しても鍵が変わらないと、ベースラインに載っているファイルの中では
 * 新しい違反を防げない（実際 `edit-eligibility.ts` は 2 箇所あるのに
 * 1 件として畳まれていた）。
 */
function countStringDeclarations(source: string, field: string): number {
  const pattern = new RegExp(
    `\\b${field}\\??\\s*:\\s*string(\\s*\\|\\s*(null|undefined))*\\s*[;,)}]`,
    "gu",
  );
  return [...source.matchAll(pattern)].length;
}

const files = ROOTS.flatMap((root) => walk(root));

/**
 * いま `string` で宣言されている `<path>::<field>` → **件数**。
 *
 * 有無ではなく件数を数える。同じ場所に 2 つ目を足したとき鍵が変わらないと、
 * ベースラインに載っている 28 ファイルの中では新しい違反が防げない。
 */
function currentViolations(): Map<string, number> {
  const targets = [...enumFields].filter((f) => !AMBIGUOUS_FIELD_NAMES.has(f));
  const out = new Map<string, number>();
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const path = file.replaceAll("\\", "/");
    for (const field of targets) {
      if (!source.includes(field)) continue;
      const count = countStringDeclarations(source, field);
      if (count > 0) out.set(`${path}::${field}`, count);
    }
  }
  return out;
}

describe("DB enum の列を string で宣言していない", () => {
  test("走査が空振りしていない", () => {
    // 実測: enum 裏打ちの field 名 40 種前後 / src 配下 2000 ファイル超。
    expect(enumFields.size).toBeGreaterThan(20);
    expect(files.length).toBeGreaterThan(500);
  });

  test("2 つの除外を混ぜていない", () => {
    // 「同じ名前の別概念」と「まだ narrow されていない層」は別の話なので、
    // 同じ箇所が両方に載っていたらどちらかが嘘。
    const overlap = [...NOT_A_DB_COLUMN.keys()].filter((k) =>
      FORM_OR_URL_VALUE.has(k),
    );
    expect(overlap).toEqual([]);
  });

  test("DB 列の射影を string で宣言していない", () => {
    // かつてここは「28 件の出発点から縮む」ratchet だった。全件を enum 型へ
    // 寄せたので一覧ごと削除してある（空の ratchet は「一覧に足せば免除される」
    // 抜け道でしかない — 命名規約ゲートで一度そうなった）。
    const added = [...currentViolations()]
      .filter(([key]) => !NOT_A_DB_COLUMN.has(key))
      .filter(([key]) => !FORM_OR_URL_VALUE.has(key))
      .map(
        ([key, count]) =>
          `${key} が ${count} 件 — schema.prisma では enum 列。` +
          `enum 型で受ければ値域が動いたとき型検査が止める`,
      );
    expect(added).toEqual([]);
  });

  test("フォーム値の宣言が実在する箇所を指している", () => {
    // 消し忘れると、後で同じ場所が DB 列の射影になっても黙って免除される。
    const current = currentViolations();
    const stale = [...FORM_OR_URL_VALUE.keys()]
      .filter((key) => (current.get(key) ?? 0) === 0)
      .map((key) => `${key}: もう string 宣言が無い。一覧から外すこと`);
    expect(stale).toEqual([]);
  });

  test("恒久除外に実在しない entry が混ざっていない", () => {
    const current = currentViolations();
    const unknown = [...NOT_A_DB_COLUMN.keys()].filter((k) => !current.has(k));
    expect(unknown).toEqual([]);
  });

  test("同名衝突の免除に実在しない field 名が混ざっていない", () => {
    const unknown = [...AMBIGUOUS_FIELD_NAMES.keys()].filter(
      (f) => !enumFields.has(f),
    );
    expect(unknown).toEqual([]);
  });
});
