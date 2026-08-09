/**
 * **コードも指示も migration を名指ししてはいけない**（baseline を除く）。
 * ディレクトリ名でも、14 桁 timestamp 単体でも同じ。
 *
 * ## なぜ
 *
 * migration 履歴は 1 本の baseline へ畳まれる。畳んだ瞬間、名前で指していた場所は
 * **存在しないものを指す文章**になる。テストなら落ちるので気づくが、コメントと
 * 散文は落ちない — 読んだ人が居ない migration を探し、見つからず、そこに書いてある
 * 前提を確かめられないまま進む。
 *
 * 実際、前身は `__tests__` しか見ておらず、畳み込みの後も schema.prisma の索引コメント・
 * seed.ts・src・deploy-production.yml・エージェント設定に消えた名前が生き残っていた。
 * 「ゲートの走査範囲を規約の置き場に合わせると、規約に書かれていない置き場を丸ごと
 * 見逃す」の実例。**件数はここに書かない**（数は必ず drift する。それが分かるのが
 * この gate の走査結果で、走らせれば出る）。
 *
 * ## 何を見るか
 *
 * 14 桁 `YYYYMMDDHHMMSS` の timestamp が、走査対象のどこかに現れたら違反。
 * `_<name>` は**付いていなくてもよい**。**コメントも見る**（前身はコメントを
 * 落としていたが、畳み込み後に残る drift はまさにコメントの中にある）。
 *
 * **`_<name>` を必須にしていたのが穴だった。** 「◯◯ で列を rename した」のように
 * timestamp だけで名指しする書き方はディレクトリ名と同じだけ宙に浮くのに、前身の
 * 正規表現は 1 件も拾えなかった。走査対象に実在したのは、ほぼ全部がこの形。
 *
 * 日付として成立しない 14 桁（fixture の連番など）は migration 名ではないので対象外。
 * baseline `00000000000000_init` も月が `00` で成立しないため、免除を書かずに外れる
 * （免除を置くと到達しない分岐になる）。
 *
 * ## 走査対象と、対象外にした理由
 *
 * | 対象 | |
 * | --- | --- |
 * | `src` / `scripts` / `__tests__` | 実行されるコード |
 * | `prisma`（`migrations/` を除く） | schema.prisma・seed.ts・baseline 入力 |
 * | `.github` | CI への指示 |
 * | `docs`（記録の 3 置き場を除く） | 人が従う runbook・ADR・alerting |
 *
 * かつてはエージェントへの**指示**（リポジトリ直下のルート指示と rules / skills 群）も
 * 走査していた。誤った前提で作業させるからだが、それらを repo から外したので対象から
 * 落とした。**再び追加するときは走査対象にも戻すこと** — 指示文書の中の消えた
 * migration 名は、コードと同じだけ人を誤らせる。
 *
 * `prisma/migrations/**` は対象外 — ディレクトリ名そのものが timestamp であり、
 * 中身は絶対規約 #7 で編集できない。
 *
 * `docs/` はかつて**丸ごと**対象外だった。理由は「日付入りの記録だから」で、それ自体は
 * 正しいが、当てはまるのは `superpowers/` と `audits/` の 2 つだけ。
 * 残りの docs（runbook・ADR・alerting）は人が従う指示で、そこに畳んだ migration の
 * 名前が残っていれば src と同じだけ人を誤らせる。**上の段落が「指示は走査対象に
 * 戻せ」と言っているのに、docs の指示だけがその外に置かれていた。** 2 つの置き場を
 * 名指しで外す形にして揃える（区別は `docs/README.md`）。
 *
 * ## 代わりに使うもの（`__tests__/support/prisma-sources.ts`）
 *
 * | 見たいもの | 使う関数 |
 * | --- | --- |
 * | CHECK / EXCLUDE / 関数 / trigger / extension | `readDatabaseInvariants()` |
 * | 履歴のどこかに DDL があること | `readAllMigrationSql()` |
 * | 畳んだ先の baseline そのもの | `readBaselineMigration()` |
 * | モデル・列・index 宣言 | `readPrismaSchema()` |
 *
 * 由来を書き残したいときは、**どの migration がやったか**ではなく**何が起きたか**を書く
 * （「一度きりの backfill で寄せ済み」「raw SQL で作られた索引」）。それは畳んでも真のままで、
 * 名前は畳めば嘘になる。
 *
 * ## 合成 fixture について
 *
 * テストが自分で作る一時ディレクトリや、引数として渡すだけの偽パスは、実在する
 * migration を指してはいない。**それでも timestamp 形の名前を使わない** — 免除を
 * 設けると「これは fixture だから」が抜け道になる。`rehearsal_fixture` のように
 * 形で区別が付く名前にする。
 *
 * この gate 自身の fixture だけは 14 桁の名前が要る（検出できることの証明だから）。
 * ソースにリテラルで置くと自分を違反として数えるので、**実行時に組み立てる**。
 */

import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, test } from "bun:test";

const ROOT = process.cwd();

/** 畳んでも残る唯一の migration 名。 */
const BASELINE_DIR_NAME = "00000000000000_init";

/**
 * 14 桁 `YYYYMMDDHHMMSS`（`_<name>` は任意）。引用符もパスも問わず、コメントの中も見る。
 *
 * 月・日・時・分・秒の範囲まで見るので、日付として成立しない 14 桁の連番は拾わない。
 * 末尾の `(?![0-9])` は、15 桁以上の数字列から先頭 14 桁を切り出さないため
 * （`\b` は前側にしか効かない）。
 */
const MIGRATION_NAME =
  /\b\d{4}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])(?:[01]\d|2[0-3])[0-5]\d[0-5]\d(?![0-9])(?:_[a-z0-9]+(?:_[a-z0-9]+)*)?/gu;

const SCAN: readonly { readonly dir: string; readonly glob: string }[] = [
  { dir: "src", glob: "**/*.{ts,tsx}" },
  { dir: "scripts", glob: "**/*.{ts,sh}" },
  { dir: "__tests__", glob: "**/*.{ts,tsx}" },
  { dir: "prisma", glob: "*.{ts,prisma}" },
  { dir: "prisma/baseline", glob: "*.{sql,json}" },
  { dir: ".github", glob: "**/*.{yml,yaml,md}" },
  // docs のうち**指示**の側。記録（下の EXCLUDED）は除く。
  { dir: "docs", glob: "**/*.md" },
];

/**
 * 日付入りの記録。当時の事実を書いたもので、指示ではない。
 *
 * かつては `docs/**` を丸ごと外していたが、docs には runbook・ADR・alerting と
 * いった**人が従う指示**も同居している。畳んだ migration の名前は、そこに
 * 書かれていればコードと同じだけ人を誤らせる。除外の根拠が当てはまる 2 つの
 * 置き場だけを外す（区別は `docs/README.md`）。
 */
const EXCLUDED_DOC_PREFIXES = [
  join("docs", "superpowers"),
  join("docs", "audits"),
] as const;

function filesUnder(entry: (typeof SCAN)[number]): string[] {
  const glob = new Bun.Glob(entry.glob);
  return [
    ...glob.scanSync({ cwd: join(ROOT, entry.dir), absolute: true }),
  ].filter((file) => {
    const rel = relative(ROOT, file);
    return !EXCLUDED_DOC_PREFIXES.some((prefix) => rel.startsWith(prefix));
  });
}

function scannedFiles(): string[] {
  return SCAN.flatMap(filesUnder);
}

/**
 * そのテキストが名指ししている migration（ディレクトリ名でも timestamp 単体でも）。
 *
 * baseline を弾く分岐は置かない。`00000000000000` は日付として成立しないので
 * `MIGRATION_NAME` が最初から拾わない。分岐を書くと到達しないコードになる。
 */
export function pinnedMigrationNames(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(MIGRATION_NAME)) {
    found.add(match[0]);
  }
  return [...found];
}

describe("コードも指示も migration を名指ししない", () => {
  test("走査対象が実在する（gate 自体が空振りしていない）", () => {
    const files = scannedFiles();
    expect(files.length).toBeGreaterThan(1000);
    // 各ルートが 1 件も拾えていない、を個別に弾く（1 つ壊れても総数で隠れないように）。
    // 除外後の件数で見る（除外が広すぎてルートごと空になったらここで落ちる）。
    for (const entry of SCAN) {
      expect({ dir: entry.dir, empty: filesUnder(entry).length === 0 }).toEqual(
        {
          dir: entry.dir,
          empty: false,
        },
      );
    }
  });

  test("通ってはいけない書き方が実際に落ちる（fixture）", () => {
    // このファイル自身も走査対象なので、fixture の migration 名は**実行時に組み立てる**。
    // ソースに 14 桁の名前をリテラルで置くと、この gate が自分を違反として数える。
    // 免除を作る代わりにこうする（免除は「これは fixture だから」の抜け道になる）。
    const stamp = `2026${"0101000000"}`;
    const ts = (suffix: string): string => `${stamp}_${suffix}`;

    // 引用符が隣接しない形（前身の正規表現はこれを取りこぼしていた）。
    expect(
      pinnedMigrationNames(
        `const A = "prisma/migrations/${ts("a")}/migration.sql";`,
      ),
    ).toEqual([ts("a")]);
    // "migration" という語を含まない行（前身の行フィルタはこれを飛ばしていた）。
    expect(pinnedMigrationNames(`const name = "${ts("rehearsal")}";`)).toEqual([
      ts("rehearsal"),
    ]);
    // コメントの中（前身はコメントを落としていた）。
    expect(
      pinnedMigrationNames(`// 実体は ${ts("add_series")} が作った索引`),
    ).toEqual([ts("add_series")]);
    // **`_<name>` の無い timestamp 単体**（前身が構造的に見られなかった形）。
    expect(pinnedMigrationNames(`// ${stamp} で列を rename した`)).toEqual([
      stamp,
    ]);
    // 範囲を「A〜B」で書く形も両端を拾う。
    expect(
      pinnedMigrationNames(`// ${stamp}〜2026${"0102000000"} の列 rename`),
    ).toEqual([stamp, `2026${"0102000000"}`]);
  });

  test("baseline と、migration 名でないものは落とさない（fixture）", () => {
    expect(pinnedMigrationNames(`const dir = "${BASELINE_DIR_NAME}";`)).toEqual(
      [],
    );
    expect(pinnedMigrationNames("_prisma_migrations テーブル")).toEqual([]);
    expect(pinnedMigrationNames("const name = 'rehearsal_fixture';")).toEqual(
      [],
    );
    // 桁数が違えば migration 名ではない。
    expect(pinnedMigrationNames('"2026080600000_short"')).toEqual([]);
    // 14 桁でも日付として成立しなければ migration 名ではない（fixture の連番等）。
    expect(pinnedMigrationNames(`const id = "1234${"5678901234"}";`)).toEqual(
      [],
    );
    expect(pinnedMigrationNames(`const t = "2026${"1301000000"}";`)).toEqual(
      [],
    );
    expect(pinnedMigrationNames(`const t = "2026${"0132000000"}";`)).toEqual(
      [],
    );
    expect(pinnedMigrationNames(`const t = "2026${"0101250000"}";`)).toEqual(
      [],
    );
    // 15 桁以上の数字列の一部を切り出さない。
    expect(pinnedMigrationNames(`const n = 2026${"01010000001"};`)).toEqual([]);
  });

  test("baseline 以外の migration 名を書いている箇所が無い", () => {
    const offenders: string[] = [];

    for (const file of scannedFiles()) {
      const names = pinnedMigrationNames(readFileSync(file, "utf8"));
      if (names.length === 0) continue;
      offenders.push(
        `${relative(ROOT, file).replaceAll("\\", "/")} :: ${names.join(", ")}`,
      );
    }

    expect({
      offenders,
      hint:
        offenders.length > 0
          ? "migration 履歴は baseline へ畳まれるので、名前で指すと存在しないものを指す文章になる。由来を残したいなら『どの migration がやったか』ではなく『何が起きたか』を書く"
          : "",
    }).toEqual({ offenders: [], hint: "" });
  });
});
