import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import { setNodeEnv } from "../../helpers/env";
import {
  LHCI_PRODUCTION_ENV_FALLBACKS,
  LHCI_READY_MARKER,
} from "../../../scripts/lhci-env";

/**
 * Lighthouse CI の runtime env 契約 gate。
 *
 * `next start` は NODE_ENV=production で `instrumentation.register()` →
 * `validateProductionEnv()` を実行する。env が 1 つでも欠けると register() が throw し、
 * サーバーは listen したまま **全リクエストが 500** になる。Lighthouse 側には
 * `ERRORED_DOCUMENT_REQUEST (Status code: 500)` としか出ず原因が判別できない。
 *
 * 実害: 2026-07-30 の full CI dispatch で "Lighthouse CI" job が全 URL 500 で fail した。
 * 原因は `validateProductionEnv()` に後から追加された必須 env
 * （APP_SURFACE / ADMIN_APP_URL / NEXT_SERVER_ACTIONS_ENCRYPTION_KEY /
 * CLOUDFLARE_ORIGIN_HEADER_SECRET / CLOUDFLARE_ZONE_ID / CLOUDFLARE_API_TOKEN）が
 * LHCI 起動経路へ反映されないまま放置された drift。
 *
 * 本テストは文字列一致ではなく、**CI job が実際に持つ env**
 * （ci.yml の workflow-level `env:` ＋ `scripts/lhci-env.ts` の fallback）を再現し、
 * 本物の `validateProductionEnv()` を実行して throw しないことを確認する。
 * 新しい本番必須 env を足した PR は、LHCI 契約を更新しない限りここで落ちる。
 */

const ciWorkflow = readFileSync(
  join(process.cwd(), ".github/workflows/ci.yml"),
  "utf8",
);
const lhciStartSource = readFileSync(
  join(process.cwd(), "scripts/lhci-start.ts"),
  "utf8",
);
const lighthouserc = readFileSync(
  join(process.cwd(), ".lighthouserc.json"),
  "utf8",
);

const originalEnv = { ...process.env };
let importCounter = 0;

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      Reflect.deleteProperty(process.env, key);
    }
  }
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key);
    } else {
      process.env[key] = value;
    }
  }
}

/** ci.yml の workflow-level `env:` ブロック（`jobs:` の手前まで）を読む。 */
function readWorkflowLevelEnv(): Record<string, string> {
  const start = ciWorkflow.indexOf("\nenv:\n");
  expect(start).toBeGreaterThan(-1);
  const end = ciWorkflow.indexOf("\njobs:\n", start);
  expect(end).toBeGreaterThan(start);

  const block = ciWorkflow.slice(start, end);
  const entries: Record<string, string> = {};
  for (const match of block.matchAll(/^ {2}([A-Z0-9_]+): (.*)$/gm)) {
    const key = match[1] ?? "";
    const raw = (match[2] ?? "").trim();
    entries[key] = raw.replace(/^["'](.*)["']$/, "$1");
  }

  // 抽出が壊れた（yaml 構造の変化）ことを 0 件で見逃さない
  expect(Object.keys(entries).length).toBeGreaterThan(5);
  return entries;
}

/**
 * Lighthouse CI job の実効 env を再現する。
 * ambient な開発者 env が結果を左右しないよう、`process.env` を明示的に組み立て直す。
 */
function applyLighthouseJobEnv(
  overrides: Record<string, string | undefined> = {},
): void {
  for (const key of Object.keys(process.env)) {
    Reflect.deleteProperty(process.env, key);
  }
  setNodeEnv("production");

  Object.assign(
    process.env,
    readWorkflowLevelEnv(),
    LHCI_PRODUCTION_ENV_FALLBACKS,
  );

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key);
    } else {
      process.env[key] = value;
    }
  }
}

async function importServerEnv(): Promise<{
  validateProductionEnv: () => void;
}> {
  importCounter += 1;
  return import(
    `../../../src/shared/lib/env/server.ts?lighthouse-env=${importCounter}`
  );
}

afterEach(() => {
  restoreEnv();
});

describe("Lighthouse CI runtime env contract", () => {
  test("the job's effective env satisfies validateProductionEnv", async () => {
    applyLighthouseJobEnv();
    const { validateProductionEnv } = await importServerEnv();

    expect(() => {
      validateProductionEnv();
    }).not.toThrow();
  });

  test("gate is live: dropping a required env makes validation throw", async () => {
    // 上のテストが「常に緑」ではないことの対照実験。
    applyLighthouseJobEnv({ NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: undefined });
    const { validateProductionEnv } = await importServerEnv();

    expect(() => {
      validateProductionEnv();
    }).toThrow(/NEXT_SERVER_ACTIONS_ENCRYPTION_KEY/);
  });

  test("E2E_RUNTIME=1 justifies skipping the Cloudflare purge credentials", async () => {
    // CDN purge を使わない localhost production runtime の既定契約。
    // 外すと CLOUDFLARE_ZONE_ID / CLOUDFLARE_API_TOKEN が必須になる。
    expect(LHCI_PRODUCTION_ENV_FALLBACKS["E2E_RUNTIME"]).toBe("1");
    expect(LHCI_PRODUCTION_ENV_FALLBACKS["CLOUDFLARE_ZONE_ID"]).toBeUndefined();

    applyLighthouseJobEnv({ E2E_RUNTIME: undefined });
    const { validateProductionEnv } = await importServerEnv();

    expect(() => {
      validateProductionEnv();
    }).toThrow(/CLOUDFLARE_ZONE_ID/);
  });

  test("APP_SURFACE=public keeps the admin-only env block out of scope", () => {
    // admin surface だと IAP_JWT_AUDIENCE も必須になる。
    // Lighthouse は公開ページのみ計測するため public 固定にしている。
    expect(LHCI_PRODUCTION_ENV_FALLBACKS["APP_SURFACE"]).toBe("public");
  });

  test("readiness marker is pinned to .lighthouserc.json startServerReadyPattern", () => {
    const pattern =
      /"startServerReadyPattern": "([^"]+)"/.exec(lighthouserc)?.[1] ?? "";

    expect(pattern).toBe(LHCI_READY_MARKER);
  });

  test("readiness is proven by /api/live, not by Next.js log wording", () => {
    // Next.js の "Ready in ..." 文言に依存すると、Next のバージョン更新で
    // ready 判定が silent に壊れる。さらに log 一致では register() の throw を
    // 検出できない（listen 済みで全 500 の状態を ready とみなしてしまう）。
    expect(lhciStartSource).toContain("/api/live");
    expect(lighthouserc).not.toContain("Ready in");
  });

  test("build runs as a CI step, never inside the ready-pattern window", () => {
    expect(lhciStartSource).not.toContain("build:skip-env");

    const start = ciWorkflow.indexOf("\n  lighthouse-ci:");
    const end = ciWorkflow.indexOf("\n  visual-regression:", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const job = ciWorkflow.slice(start, end);
    expect(job).toContain("bun run build:skip-env:prepared");
    expect(job).toContain("bunx lhci autorun");
  });
});
