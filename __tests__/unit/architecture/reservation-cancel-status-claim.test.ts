/**
 * Reservation.status を CANCELLED に書く update / updateMany は、
 * 同じ call の where に status 条件を必須とする。
 *
 * ## なぜ
 *
 * N-01: 削除が `where: { id, deletedAt: null }` だけで CANCELLED を書き、
 * 並行キャンセルが先に atomic claim + クーポン解放したあと、削除側が
 * stale フラグのまま再度解放・副作用を発火した。正規キャンセルは
 * `updateMany({ where: { status: { in: CANCELLABLE } } })` の claim。
 *
 * ## 何を見るか
 *
 * `src/shared/domain/reservations/**` の `.reservation.update` / `updateMany`
 * 引数オブジェクト。data が `status: …CANCELLED` を含むなら、where に
 * `status:` が無いものを違反とする。
 *
 * 粗い: 変数経由の `data: { status }`（リテラル CANCELLED なし）は見ない。
 * 現状の CANCELLED 遷移はすべて `ReservationStatus.CANCELLED` 直書き。
 *
 * ## 直し方
 *
 * `where` に `status: { in: CANCELLABLE_STATUSES }` または現 status の
 * equality を足し、`count === 0` なら失敗返す。cancel-core.ts を見本にする。
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { relative } from "node:path";

import { collectSourceFiles } from "../../helpers/architecture-fs";

const ROOT = process.cwd();
const TARGET_DIR = `${ROOT}/src/shared/domain/reservations`;

function blankComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//gu, (m) => " ".repeat(m.length))
    .replace(/(^|[^:])\/\/.*$/gmu, (m, prefix: string) => {
      return prefix + " ".repeat(m.length - prefix.length);
    });
}

function findMatchingBrace(src: string, openIdx: number): number {
  let depth = 0;
  let inStr: string | null = null;
  let escape = false;

  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (inStr !== null) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inStr = c;
      continue;
    }
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findMatchingParen(src: string, openIdx: number): number {
  let depth = 0;
  let inStr: string | null = null;
  let escape = false;

  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (inStr !== null) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inStr = c;
      continue;
    }
    if (c === "(") depth += 1;
    else if (c === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function topLevelProperty(obj: string, name: string): string | null {
  const keyRe = new RegExp(`\\b${name}\\s*:`, "gu");
  let match: RegExpExecArray | null;
  while ((match = keyRe.exec(obj)) !== null) {
    const colon = match.index + match[0].length - 1;
    let depth = 0;
    for (let i = 0; i < match.index; i++) {
      const c = obj[i];
      if (c === "{") depth += 1;
      else if (c === "}") depth -= 1;
    }
    if (depth !== 1) continue;
    let i = colon + 1;
    while (/\s/u.test(obj[i] ?? "")) i += 1;
    if (obj[i] === "{") {
      const end = findMatchingBrace(obj, i);
      return end === -1 ? null : obj.slice(i, end + 1);
    }
    const end = obj.indexOf(",", i);
    return obj.slice(i, end === -1 ? obj.length : end);
  }
  return null;
}

export function findCancelledWritesWithoutStatusClaim(raw: string): number[] {
  const src = blankComments(raw);
  const hits: number[] = [];
  const callRe = /\.reservation\s*\.\s*update(?:Many)?\s*\(/gu;
  let match: RegExpExecArray | null;

  while ((match = callRe.exec(src)) !== null) {
    const parenOpen = match.index + match[0].length - 1;
    const parenClose = findMatchingParen(src, parenOpen);
    if (parenClose === -1) continue;
    const args = src.slice(parenOpen + 1, parenClose);
    const objStart = args.indexOf("{");
    if (objStart === -1) continue;
    const obj = args.slice(objStart);
    const data = topLevelProperty(obj, "data");
    const where = topLevelProperty(obj, "where");
    if (data === null) continue;
    if (!/\bstatus\s*:/.test(data) || !/\bCANCELLED\b/.test(data)) continue;
    if (where !== null && /\bstatus\s*:/.test(where)) continue;
    hits.push(match.index);
  }

  return hits;
}

function collectReservationSources(): { rel: string; source: string }[] {
  return collectSourceFiles(TARGET_DIR).map((abs) => ({
    rel: relative(ROOT, abs).replaceAll("\\", "/"),
    source: readFileSync(abs, "utf8"),
  }));
}

const FAILING = `
await tx.reservation.update({
  where: { id, deletedAt: null },
  data: { status: ReservationStatus.CANCELLED, deletedAt: now },
});
`;

const PASSING = `
await tx.reservation.updateMany({
  where: {
    id,
    deletedAt: null,
    status: { in: [...CANCELLABLE_STATUSES] },
  },
  data: { status: ReservationStatus.CANCELLED },
});
`;

describe("Reservation CANCELLED 書込は status claim 必須", () => {
  test("落ちるべき書き方: where に status が無い CANCELLED 書込", () => {
    expect(findCancelledWritesWithoutStatusClaim(FAILING).length).toBe(1);
  });

  test("落ちてはいけない書き方: where.status 付き claim / 非 CANCELLED", () => {
    expect(findCancelledWritesWithoutStatusClaim(PASSING)).toEqual([]);
    expect(
      findCancelledWritesWithoutStatusClaim(
        `await tx.reservation.updateMany({
          where: { id, deletedAt: null },
          data: { deletedAt: now },
        });`,
      ),
    ).toEqual([]);
    expect(
      findCancelledWritesWithoutStatusClaim(
        `await tx.reservation.updateMany({
          where: { id, status: previousStatus },
          data: { status },
        });`,
      ),
    ).toEqual([]);
  });

  test("走査対象が空でない（0 件と「違反なし」を分ける）", () => {
    expect(collectReservationSources().length).toBeGreaterThan(20);
  });

  test("reservations ドメインに status 無し CANCELLED 書込が無い", () => {
    const offenders = collectReservationSources().flatMap(({ rel, source }) =>
      findCancelledWritesWithoutStatusClaim(source).map((index) => {
        const line = source.slice(0, index).split(/\n/u).length;
        return `${rel}:${String(line)}`;
      }),
    );
    expect(offenders).toEqual([]);
  });
});
