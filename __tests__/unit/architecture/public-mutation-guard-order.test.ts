/**
 * 公開 Server Action の mutation guard 順序契約。
 *
 * 最安チェックを先に置く不変契約。順序変更は silent regression（Turnstile
 * トークン消費タイミング・email 第二防壁の迂回）になるため、handler 本体を
 * 静的解析で固定する。
 *
 * 4 段のフル pipeline:
 *   checkActionRateLimit → checkEmailRateLimit → checkBotHeuristics → validateTurnstile
 *
 * 各エントリの `guards` はその handler が満たすべき **順序つき部分列**。
 * 空配列は「この mutation は認証済みフローのため公開 bot/rate/Turnstile
 * pipeline を持たない」ことを明示する（consumeSignupTermsAction）。
 *
 * Reads (`fetch*` / `get*`) は命名規約で検査対象外。その prefix を外した
 * 読み取りは fail-safe（false positive: mutation として登録するまで赤）。
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, test } from "bun:test";

const ROOT = process.cwd();
const PUBLIC_ACTIONS_DIR = join(
  ROOT,
  "src",
  "app",
  "(public)",
  "_shared",
  "actions",
);

const FOUR_STAGE_GUARDS = [
  "checkActionRateLimit",
  "checkEmailRateLimit",
  "checkBotHeuristics",
  "validateTurnstile",
] as const;

function actionFile(name: string): string {
  return join(PUBLIC_ACTIONS_DIR, name);
}

/** 公開 mutation の SSoT（このリストが正本） */
const PUBLIC_MUTATION_GUARD_PIPELINES: readonly {
  readonly file: string;
  readonly handler: string;
  readonly guards: readonly string[];
}[] = [
  {
    file: actionFile("reservation.ts"),
    handler: "submitReservation",
    guards: FOUR_STAGE_GUARDS,
  },
  {
    file: actionFile("event-registration.ts"),
    handler: "registerForEvent",
    guards: FOUR_STAGE_GUARDS,
  },
  {
    file: actionFile("event-registration.ts"),
    handler: "registerForEventWaitlist",
    guards: FOUR_STAGE_GUARDS,
  },
  {
    file: actionFile("inquiry.ts"),
    handler: "submitInquiry",
    guards: ["checkActionRateLimit", "checkBotHeuristics", "validateTurnstile"],
  },
  {
    file: actionFile("review.ts"),
    handler: "submitReview",
    guards: ["checkActionRateLimit", "validateTurnstile"],
  },
  {
    file: actionFile("event-registration.ts"),
    handler: "cancelEventRegistration",
    guards: ["checkActionRateLimit", "validateTurnstile"],
  },
  {
    file: actionFile("reveal-reservation-passcodes.ts"),
    handler: "revealReservationPasscodesAction",
    guards: ["checkActionRateLimit"],
  },
  // Web Vitals は同意済みブラウザからの計測サンプル。bot 判定も Turnstile も
  // 意味を持たない（人間の操作ではない）が、**無制限に書けてはいけない**
  // ため rate limit だけを要求する（監査 A-49）。
  {
    file: actionFile("web-vital.ts"),
    handler: "reportWebVitalAction",
    guards: ["checkActionRateLimit"],
  },
  // 認証済みフロー（mypage / claim callback）。公開 bot pipeline は持たない。
  {
    file: actionFile("consume-signup-terms.ts"),
    handler: "consumeSignupTermsAction",
    guards: [],
  },
];

const GUARD_CALL_PATTERNS: Readonly<Record<string, RegExp>> = {
  checkActionRateLimit: /\bcheckActionRateLimit\s*\(/u,
  checkEmailRateLimit: /\bcheckEmailRateLimit\s*\(/u,
  checkBotHeuristics: /\bcheckBotHeuristics\s*\(/u,
  validateTurnstile: /\bvalidateTurnstile\s*\(/u,
};

const EXPORTED_ASYNC_FN_RE = /^export async function (\w+)/gmu;

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

function findGuardCallIndices(
  handlerSource: string,
  guards: readonly string[],
) {
  return guards.map((name) => {
    const pattern = GUARD_CALL_PATTERNS[name];
    if (!pattern) {
      return { name, index: -1 };
    }
    const match = pattern.exec(handlerSource);
    return { name, index: match?.index ?? -1 };
  });
}

function discoverPublicMutations(): readonly {
  readonly file: string;
  readonly handler: string;
}[] {
  const actionFiles = readdirSync(PUBLIC_ACTIONS_DIR)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => join(PUBLIC_ACTIONS_DIR, name));

  const mutations: { file: string; handler: string }[] = [];
  for (const file of actionFiles) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(EXPORTED_ASYNC_FN_RE)) {
      const handler = match[1];
      if (!handler) {
        continue;
      }
      if (handler.startsWith("fetch") || handler.startsWith("get")) {
        continue;
      }
      mutations.push({ file, handler });
    }
  }
  return mutations;
}

describe("public mutation guard order", () => {
  test("SSoT action files exist", () => {
    const uniqueFiles = [
      ...new Set(PUBLIC_MUTATION_GUARD_PIPELINES.map(({ file }) => file)),
    ];
    for (const file of uniqueFiles) {
      expect(existsSync(file)).toBe(true);
    }
  });

  test("each handler's guards appear as an ordered subsequence", () => {
    const violations: string[] = [];

    for (const { file, handler, guards } of PUBLIC_MUTATION_GUARD_PIPELINES) {
      const label = `${relative(ROOT, file).replaceAll("\\", "/")}#${handler}`;
      const source = readFileSync(file, "utf8");
      const handlerSource = extractExportedFunctionSource(source, handler);
      const indices = findGuardCallIndices(handlerSource, guards);

      const listed = new Set(guards);
      const undeclared = Object.keys(GUARD_CALL_PATTERNS).filter((name) => {
        if (listed.has(name)) {
          return false;
        }
        const pattern = GUARD_CALL_PATTERNS[name];
        return pattern !== undefined && pattern.test(handlerSource);
      });
      if (undeclared.length > 0) {
        violations.push(
          `${label}: undeclared guards: ${undeclared.join(", ")}`,
        );
      }

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
        if (current === undefined || next === undefined) {
          continue;
        }
        if (current.index >= next.index) {
          violations.push(
            `${label}: ${current.name} must precede ${next.name} (found at ${current.index} vs ${next.index})`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  /**
   * Reads (`fetch*` / `get*`) are excluded by naming convention. Renaming a
   * read away from that prefix fails safe (false positive: it must be
   * registered as a mutation until renamed back or added here).
   */
  test("every public mutation is registered and every registry handler exists", () => {
    const discovered = discoverPublicMutations();
    // 走査が 0 件だと「違反なし」と区別できない（local/gate-scan-must-not-be-silently-empty）。
    expect(discovered.length).toBeGreaterThan(7);
    const registeredHandlers = new Set(
      PUBLIC_MUTATION_GUARD_PIPELINES.map(({ handler }) => handler),
    );
    const discoveredHandlers = new Set(
      discovered.map(({ handler }) => handler),
    );

    const unregistered = discovered
      .filter(({ handler }) => !registeredHandlers.has(handler))
      .map(
        ({ file, handler }) =>
          `${relative(ROOT, file).replaceAll("\\", "/")}#${handler}`,
      );
    const stale = PUBLIC_MUTATION_GUARD_PIPELINES.filter(
      ({ handler }) => !discoveredHandlers.has(handler),
    ).map(({ handler }) => handler);

    expect({ unregistered, stale }).toEqual({ unregistered: [], stale: [] });
  });
});
