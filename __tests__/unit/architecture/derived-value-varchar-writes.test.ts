/**
 * 連結して作った値を、上限のある列へ**そのまま**書いていないことの gate。
 *
 * ## なぜ要るのか
 *
 * `varchar-write-bounds` は「その列に上限がある」ことと「名指しした Zod schema が
 * その上限で止まる」ことを確かめる。**元の値どうしを連結した結果**は見ない。
 * 連結は上限を足し算するので、両方が上限いっぱいだと必ず溢れる。
 *
 * 溢れた先は、VarChar なら PostgreSQL の 22001、Text でも Zod `.max()` が
 * 以後の編集を全部ブロックする。どちらも操作者には理由が出にくい。
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
 * | `spaces.name` Text + Zod.max(100) | `${name}（コピー）` | 105 |
 * | `spaces.slug` Text + Zod.max(100) | `${slug}-copy` + `-2` | 107 |
 *
 * 前 2 者は列を `@db.Text` にして解消。後ろは
 * `src/shared/lib/text/bounded-append.ts` で**元の値を詰めてから**連結する。
 *
 * ## 見えるもの / 見えないもの
 *
 * **見える**: `prisma.<model>.create/update/upsert({ data: { <field>: `...` } })` の
 * 形で、`<field>` が `@db.VarChar(n)` **または** Zod 側に上限がある Text 列
 * （`ZOD_BOUNDED_TEXT`）であるもの。
 *
 * **見えない**: いったん変数や関数呼び出しを経由する形
 * （`const slug = f(\`${a}-copy\`)` → `slug,`）。実際 `events.slug` / `spaces.slug`
 * はこの形で、この gate では捕まえられない — 見つけたのは人間の目視である。
 * 静的に追うには型情報つきの解析が要るので、**ここで嘘をつかないために明記する。**
 * その穴は `bounded-append.ts` を通す規律で埋めている。
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { readPrismaSchema } from "../../support/prisma-sources";
import {
  SPACE_NAME_MAX_LENGTH,
  SPACE_SLUG_MAX_LENGTH,
} from "@/shared/lib/validations/space-limits";

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

/**
 * Zod 側に上限がある Text 列。VarChar ではないので schema 走査では拾えないが、
 * 連結溢れの実害（以後の編集が `.max()` で止まる）は同じ。
 */
const ZOD_BOUNDED_TEXT = new Map<string, number>([
  ["space.name", SPACE_NAME_MAX_LENGTH],
  ["space.slug", SPACE_SLUG_MAX_LENGTH],
]);

const BOUNDED = new Map<string, number>([
  ...varCharFieldsByPrismaAccessor(),
  ...ZOD_BOUNDED_TEXT,
]);

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

/**
 * 走査したファイル数。**走査集合そのものの下限**を assert するために残す（監査 A-24）。
 *
 * 以前の「前提の自己検査」は `BOUNDED.size`（schema 由来の列上限 Map）を測っており、
 * 走査したファイル集合を見ていなかった。`src` の拡張子やルートが変わって
 * 走査が 0 件になっても、`offenders` は空のまま緑になる（変異検査で実証済み）。
 */
let scannedFileCount = 0;

function scanTrackedSources(): Finding[] {
  const files = execFileSync("git", ["ls-files", "-z", "src"], {
    cwd: ROOT,
    maxBuffer: 32 * 1024 * 1024,
  })
    .toString("utf8")
    .split(String.fromCharCode(0))
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
  scannedFileCount = files.length;

  const findings: Finding[] = [];
  for (const file of files) {
    const source = readFileSync(join(ROOT, file), "utf8");
    if (!source.includes("prisma.") && !source.includes("tx.")) continue;

    for (const call of source.matchAll(WRITE_CALL)) {
      const accessor = call[1];
      const openParen = call.index + call[0].length - 1;
      const args = callArguments(source, openParen);
      if (!accessor || args === null) continue;

      for (const assign of args.matchAll(/(\w+)\s*:\s*`/gu)) {
        const limit = BOUNDED.get(`${accessor}.${assign[1] ?? ""}`);
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
    // 走査集合そのものの下限（監査 A-24）。実測 2322 ファイル。
    expect(scannedFileCount).toBeGreaterThan(1500);
    expect(BOUNDED.size).toBeGreaterThan(50);
    expect(BOUNDED.get("event.title")).toBe(200);
    expect(BOUNDED.get("inquiry.name")).toBe(101);
    expect(BOUNDED.get("space.name")).toBe(SPACE_NAME_MAX_LENGTH);
    expect(BOUNDED.get("space.slug")).toBe(SPACE_SLUG_MAX_LENGTH);

    const sample = "await prisma.event.create({ data: { title: `x${y}` } });";
    const openParen = sample.indexOf("(");
    expect(callArguments(sample, openParen)).toContain("title: `x${y}`");
  });

  test("テンプレートリテラルを上限のある列へ直接書いていない", () => {
    const offenders = FINDINGS.map(
      (f) =>
        `${f.file}:${f.line} — ${f.target} は上限 ${f.limit}。` +
        `連結結果は元の値の上限の和になるので、` +
        `src/shared/lib/text/bounded-append.ts の appendWithinLimit で詰めてから渡す`,
    );

    expect(offenders).toEqual([]);
  });
});
