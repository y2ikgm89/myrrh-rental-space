/**
 * 連結して作った値を、上限のある列へ**そのまま**書いていないことの gate。
 *
 * ## なぜ要るのか
 *
 * `varchar-write-bounds` は「その列に上限がある」ことと「名指しした Zod schema が
 * その上限で止まる」ことを確かめる。**元の値どうしを連結した結果**は見ない。
 * 連結は上限を足し算するので、両方が上限いっぱいだと必ず溢れる。
 *
 * 溢れた先は PostgreSQL の 22001 で、`DomainError` ではないので
 * `executeAdminMutationResult` の変換に乗らず 500 になる。**操作者には理由が出ない。**
 *
 * 実際に踏んだもの:
 *
 * | 書込先 | 作り方 | 最大 |
 * | --- | --- | --- |
 * | `receipts.subject` VarChar(100) | イベント名(200) から生成 | 200+ |
 * | `receipts.recipient_name` VarChar(100) | 姓(50) + 空白 + 名(50) | 101 |
 * | `inquiries.name` VarChar(100) | 姓(50) + 空白 + 名(50) | 101 |
 * | `events.title` VarChar(200) | `${title}（コピー）` | 205 |
 * | `events.slug` VarChar(100) | `${slug}-copy` + `-2` | 107 |
 *
 * 前 2 者は列を `@db.Text` にして解消。後ろ 3 者は
 * `src/shared/lib/text/bounded-append.ts` で**元の値を詰めてから**連結する。
 *
 * ## この gate は約束の履行である
 *
 * `varchar-write-bounds` の docblock は長らく「派生値を VarChar 列へ書く形の検出は
 * **別 gate で扱う**」と書いたまま、その gate が存在しなかった。散文で批判を
 * かわして実装が無い状態で、実際に上の 2 件（`events.title` / `events.slug`）が
 * 生きたまま残っていた。
 *
 * ## 見えるもの / 見えないもの
 *
 * **見える**: `prisma.<model>.create/update/upsert({ data: { <field>: `...` } })` の
 * 形で、`<field>` が `@db.VarChar(n)` の列であるもの。
 *
 * **見えない**: いったん変数や関数呼び出しを経由する形
 * （`const slug = f(\`${a}-copy\`)` → `slug,`）。実際 `events.slug` はこの形で、
 * この gate では捕まえられなかった — 見つけたのは人間の目視である。
 * 静的に追うには型情報つきの解析が要るので、**ここで嘘をつかないために明記する。**
 * その穴は `bounded-append.ts` を通す規律と、`varchar-write-bounds` の
 * `source` 付き契約（上限を定数に縛る）で埋めている。
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { readPrismaSchema } from "../../support/prisma-sources";

const ROOT = process.cwd();

/** `camelCaseModel.field` → VarChar の上限。Prisma の呼び出しはモデル名が camelCase。 */
function varCharFieldsByPrismaAccessor(): Map<string, number> {
  const out = new Map<string, number>();
  let model: string | null = null;

  for (const raw of readPrismaSchema().split(/\r?\n/u)) {
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

    const decl = /^\s*(\w+)\s+String\??\s*(.*)$/u.exec(line);
    if (!decl?.[1]) continue;
    const limit = /@db\.VarChar\((\d+)\)/u.exec(decl[2] ?? "")?.[1];
    if (limit === undefined) continue;

    const accessor = `${model.charAt(0).toLowerCase()}${model.slice(1)}`;
    out.set(`${accessor}.${decl[1]}`, Number(limit));
  }
  return out;
}

const VARCHAR = varCharFieldsByPrismaAccessor();

const WRITE_CALL =
  /\b(?:prisma|tx)\.(\w+)\.(?:create|update|upsert|updateMany|createMany)\s*\(/gu;

interface Finding {
  readonly file: string;
  readonly line: number;
  readonly target: string;
  readonly limit: number;
}

/** 呼び出しの引数リテラル（括弧の対応が取れる範囲）を切り出す。 */
function callArguments(source: string, openParen: number): string | null {
  let depth = 0;
  for (let i = openParen; i < source.length; i++) {
    const ch = source[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return source.slice(openParen, i);
    }
  }
  return null;
}

function scanTrackedSources(): Finding[] {
  const files = execFileSync("git", ["ls-files", "-z", "src"], {
    cwd: ROOT,
    maxBuffer: 32 * 1024 * 1024,
  })
    .toString("utf8")
    .split(String.fromCharCode(0))
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));

  const findings: Finding[] = [];
  for (const file of files) {
    const source = readFileSync(join(ROOT, file), "utf8");
    if (!source.includes("prisma.") && !source.includes("tx.")) continue;

    for (const call of source.matchAll(WRITE_CALL)) {
      const accessor = call[1];
      const openParen = call.index + call[0].length - 1;
      const args = callArguments(source, openParen);
      if (!accessor || args === null) continue;

      // `field: \`` の形（テンプレートリテラルを直接渡している）だけを見る。
      for (const assign of args.matchAll(/(\w+)\s*:\s*`/gu)) {
        const limit = VARCHAR.get(`${accessor}.${assign[1] ?? ""}`);
        if (limit === undefined) continue;
        findings.push({
          file,
          line: source.slice(0, openParen + assign.index).split("\n").length,
          target: `${accessor}.${assign[1] ?? ""}`,
          limit,
        });
      }
    }
  }
  return findings;
}

const FINDINGS = scanTrackedSources();

describe("上限のある列への連結書込", () => {
  test("gate が空振りしていない（前提の自己検査）", () => {
    // schema のパースが壊れると以降が全部 vacuous に通る。
    expect(VARCHAR.size).toBeGreaterThan(50);
    // 既知の列で accessor の綴りを固定する（モデル名の camelCase 変換の検査）。
    expect(VARCHAR.get("event.title")).toBe(200);
    expect(VARCHAR.get("inquiry.name")).toBe(101);

    // 走査そのものが動いていること。見本を食わせて拾えるか確かめる
    // （実データが 0 件でも成立する形にする）。
    const sample = "await prisma.event.create({ data: { title: `x${y}` } });";
    const openParen = sample.indexOf("(");
    expect(callArguments(sample, openParen)).toContain("title: `x${y}`");
  });

  test("テンプレートリテラルを VarChar 列へ直接書いていない", () => {
    const offenders = FINDINGS.map(
      (f) =>
        `${f.file}:${f.line} — ${f.target} は VarChar(${f.limit})。` +
        `連結結果は元の値の上限の和になるので、` +
        `src/shared/lib/text/bounded-append.ts の appendWithinLimit で詰めてから渡す`,
    );

    expect(offenders).toEqual([]);
  });
});
