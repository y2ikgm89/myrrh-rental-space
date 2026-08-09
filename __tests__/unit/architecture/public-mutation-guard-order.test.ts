/**
 * 公開フォーム action — 予約 / イベント申込の 4 段 guard 順序契約:
 *
 *   checkActionRateLimit → checkEmailRateLimit → checkBotHeuristics → validateTurnstile
 *
 * DB / 外部 API を伴わない最安チェックを先に置く不変契約。順序変更は silent regression
 * （Turnstile トークン消費タイミング・email 第二防壁の迂回）になるため、対象 Server
 * Action の handler 本体を静的解析で固定する。
 */

import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, test } from "bun:test";

const ROOT = process.cwd();

/** 4 段 pipeline を持つ公開 mutation の SSoT（forms-mutations.md と同期） */
const PUBLIC_MUTATION_GUARD_PIPELINES = [
  {
    file: join(
      ROOT,
      "src",
      "app",
      "(public)",
      "_shared",
      "actions",
      "reservation.ts",
    ),
    handler: "submitReservation",
  },
  {
    file: join(
      ROOT,
      "src",
      "app",
      "(public)",
      "_shared",
      "actions",
      "event-registration.ts",
    ),
    handler: "registerForEvent",
  },
  {
    file: join(
      ROOT,
      "src",
      "app",
      "(public)",
      "_shared",
      "actions",
      "event-registration.ts",
    ),
    handler: "registerForEventWaitlist",
  },
] as const;

const GUARD_CALL_ORDER = [
  { name: "checkActionRateLimit", pattern: /\bcheckActionRateLimit\s*\(/u },
  { name: "checkEmailRateLimit", pattern: /\bcheckEmailRateLimit\s*\(/u },
  { name: "checkBotHeuristics", pattern: /\bcheckBotHeuristics\s*\(/u },
  { name: "validateTurnstile", pattern: /\bvalidateTurnstile\s*\(/u },
] as const;

function extractExportedFunctionSource(
  source: string,
  handler: string,
): string {
  const startRe = new RegExp(
    String.raw`export\s+async\s+function\s+${handler}\s*\(`,
    "u",
  );
  const startMatch = startRe.exec(source);
  if (!startMatch) {
    throw new Error(`export async function ${handler} not found`);
  }

  const bodyStart = startMatch.index;
  const nextExportRe = /export\s+async\s+function\s+/gu;
  nextExportRe.lastIndex = bodyStart + startMatch[0].length;
  const nextExport = nextExportRe.exec(source);
  const bodyEnd = nextExport?.index ?? source.length;

  return source.slice(bodyStart, bodyEnd);
}

function findGuardCallIndices(handlerSource: string) {
  return GUARD_CALL_ORDER.map(({ name, pattern }) => {
    const match = pattern.exec(handlerSource);
    return { name, index: match?.index ?? -1 };
  });
}

describe("public reservation / event-registration mutation guard order", () => {
  test("SSoT action files exist", () => {
    const uniqueFiles = [
      ...new Set(PUBLIC_MUTATION_GUARD_PIPELINES.map(({ file }) => file)),
    ];
    for (const file of uniqueFiles) {
      expect(existsSync(file)).toBe(true);
    }
  });

  test("4 guards appear in required order in each SSoT handler", () => {
    const violations: string[] = [];

    for (const { file, handler } of PUBLIC_MUTATION_GUARD_PIPELINES) {
      const label = `${relative(ROOT, file).replaceAll("\\", "/")}#${handler}`;
      const source = readFileSync(file, "utf8");
      const handlerSource = extractExportedFunctionSource(source, handler);
      const indices = findGuardCallIndices(handlerSource);

      const missing = indices
        .filter(({ index }) => index < 0)
        .map(({ name }) => name);
      if (missing.length > 0) {
        violations.push(`${label}: missing guards: ${missing.join(", ")}`);
        continue;
      }

      for (let i = 0; i < indices.length - 1; i += 1) {
        const current = indices[i];
        const next = indices[i + 1];
        if (current.index >= next.index) {
          violations.push(
            `${label}: ${current.name} must precede ${next.name} (found at ${current.index} vs ${next.index})`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
