/**
 * IntegrationHealth.consecutiveFailures の一時失敗加算は Prisma increment だけ。
 *
 * ## なぜ
 *
 * N-06: `findUnique` → JS で +1 → `upsert` の絶対値書込は非原子的 RMW。
 * 並列失敗が同時に 0 を読むと両方 1 を書き、実失敗 3 回以上でも ERROR
 * に届かない。Prisma 公式は原子加算 `increment`。
 *
 * ## 何を見るか
 *
 * `src/shared/domain/settings/connection-health.ts` の
 * `consecutiveFailures:` 代入。許可は `{ increment: 1 }` / 数値リテラル /
 * `CONNECTION_FAILURE_THRESHOLD`。`existing… + 1` の RMW を違反とする。
 *
 * ## 直し方
 *
 * 一時失敗は `consecutiveFailures: { increment: 1 }`。成功時の 0 クリアと
 * permanent 失敗の閾値直書きはそのまま。
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const TARGET = join(
  process.cwd(),
  "src",
  "shared",
  "domain",
  "settings",
  "connection-health.ts",
);

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

function extractPropertyValue(obj: string, name: string): string | null {
  const keyRe = new RegExp(`\\b${name}\\s*:`, "gu");
  let match: RegExpExecArray | null;
  while ((match = keyRe.exec(obj)) !== null) {
    let depth = 0;
    for (let i = 0; i < match.index; i++) {
      const c = obj[i];
      if (c === "{") depth += 1;
      else if (c === "}") depth -= 1;
    }
    if (depth !== 1) continue;
    let i = match.index + match[0].length;
    while (/\s/u.test(obj[i] ?? "")) i += 1;
    if (obj[i] === "{") {
      const end = findMatchingBrace(obj, i);
      return end === -1 ? null : obj.slice(i, end + 1);
    }
    const end = obj.slice(i).search(/[,}\n]/u);
    return obj.slice(i, end === -1 ? obj.length : i + end).trim();
  }
  return null;
}

function isAllowedConsecutiveFailuresValue(value: string): boolean {
  const compact = value.replace(/\s+/gu, " ").trim();
  if (/^\{ increment: 1 \}$/.test(compact)) return true;
  if (/^\d+$/.test(compact)) return true;
  if (compact === "CONNECTION_FAILURE_THRESHOLD") return true;
  return false;
}

export function findNonAtomicConsecutiveFailureWrites(
  source: string,
): number[] {
  const hits: number[] = [];
  const callRe = /integrationHealth\s*\.\s*(?:create|update|upsert)\s*\(/gu;
  let match: RegExpExecArray | null;
  while ((match = callRe.exec(source)) !== null) {
    const parenOpen = match.index + match[0].length - 1;
    const parenClose = findMatchingParen(source, parenOpen);
    if (parenClose === -1) continue;
    const args = source.slice(parenOpen + 1, parenClose);
    const objStart = args.indexOf("{");
    if (objStart === -1) continue;
    const obj = args.slice(objStart);
    const writeObjects = [obj];
    const create = extractPropertyValue(obj, "create");
    const update = extractPropertyValue(obj, "update");
    const data = extractPropertyValue(obj, "data");
    if (create) writeObjects.push(create);
    if (update) writeObjects.push(update);
    if (data) writeObjects.push(data);
    for (const writeObj of writeObjects) {
      const value = extractPropertyValue(writeObj, "consecutiveFailures");
      if (value === null) continue;
      if (isAllowedConsecutiveFailuresValue(value)) continue;
      hits.push(match.index);
    }
  }
  return hits;
}

const FAILING = `
const nextFailures = (existing?.consecutiveFailures ?? 0) + 1;
await prisma.integrationHealth.upsert({
  update: { consecutiveFailures: nextFailures },
});
`;

const PASSING = `
await prisma.integrationHealth.upsert({
  create: { consecutiveFailures: 1 },
  update: { consecutiveFailures: { increment: 1 } },
});
await prisma.integrationHealth.upsert({
  update: { consecutiveFailures: CONNECTION_FAILURE_THRESHOLD },
});
await prisma.integrationHealth.update({
  data: { consecutiveFailures: 0 },
});
`;

describe("IntegrationHealth consecutiveFailures は原子加算", () => {
  test("落ちるべき書き方: RMW の絶対値書込", () => {
    expect(findNonAtomicConsecutiveFailureWrites(FAILING).length).toBe(1);
  });

  test("落ちてはいけない書き方: increment / リテラル / 閾値定数", () => {
    expect(findNonAtomicConsecutiveFailureWrites(PASSING)).toEqual([]);
  });

  test("走査対象が空でない（0 件と「違反なし」を分ける）", () => {
    const source = readFileSync(TARGET, "utf8");
    expect(source.length).toBeGreaterThan(800);
    expect(
      source.match(/integrationHealth\s*\.\s*(?:create|update|upsert)\s*\(/gu)
        ?.length ?? 0,
    ).toBeGreaterThan(2);
  });

  test("connection-health.ts に非原子加算が無い", () => {
    const source = readFileSync(TARGET, "utf8");
    expect(findNonAtomicConsecutiveFailureWrites(source)).toEqual([]);
  });
});
