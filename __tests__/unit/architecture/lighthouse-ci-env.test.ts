import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import { setNodeEnv } from "../../helpers/env";
import {
  applyLhciProductionFallbacks,
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
 * Lighthouse CI job の実効 env を、**実際の起動経路と同じ順序で**再現する。
 *
 * 1. runner の env（ci.yml の workflow-level `env:`）を敷く
 * 2. `applyLhciProductionFallbacks()` を**実物のまま**呼ぶ
 *
 * 定数 {@link LHCI_PRODUCTION_ENV_FALLBACKS} を直接 Object.assign しないのが要点。
 * fallback は「未設定 / 空文字のときだけ埋める」= workflow 側の値を保存する契約なので、
 * 定数で上書きすると両者が重複するキー（BETTER_AUTH_URL / AUDIT_LOG_HMAC_KEY 等）で
 * 実際に使われる値とテストが使う値が食い違い、ci.yml 側が壊れても緑になる。
 * 実物を呼ぶことで `applyLhciProductionFallbacks()` 自体の退行もこの gate で捕まる。
 *
 * ambient な開発者 env が結果を左右しないよう、`process.env` は明示的に組み立て直す。
 * overrides は fallback 適用の**後**に効かせる（欠落を再現する対照実験のため）。
 */
function applyLighthouseJobEnv(
  overrides: Record<string, string | undefined> = {},
): void {
  for (const key of Object.keys(process.env)) {
    Reflect.deleteProperty(process.env, key);
  }
  setNodeEnv("production");

  Object.assign(process.env, readWorkflowLevelEnv());
  applyLhciProductionFallbacks();

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

  test("fallbacks fill gaps without overwriting the runner's own env", async () => {
    // 実 job では ci.yml の workflow-level env が先に入っており、fallback は
    // 未設定のキーだけを埋める。この契約が崩れる（無条件上書きになる）と、
    // 「テストは fallback 値で緑／実 job は ci.yml 値で赤」の乖離が生まれる。
    const workflowEnv = readWorkflowLevelEnv();
    const overlapping = Object.keys(workflowEnv).filter(
      (key) => key in LHCI_PRODUCTION_ENV_FALLBACKS,
    );

    // 重複が 0 件ならこのテストは空回りする（ci.yml / fallback の構造変化を検出）
    expect(overlapping.length).toBeGreaterThan(0);

    applyLighthouseJobEnv();

    for (const key of overlapping) {
      expect(`${key}=${process.env[key] ?? ""}`).toBe(
        `${key}=${workflowEnv[key] ?? ""}`,
      );
    }

    // 重複しないキーは fallback がそのまま供給する
    expect(process.env["NEXT_SERVER_ACTIONS_ENCRYPTION_KEY"]).toBe(
      LHCI_PRODUCTION_ENV_FALLBACKS["NEXT_SERVER_ACTIONS_ENCRYPTION_KEY"],
    );

    // ci.yml 側の値をそのまま使っても production 検証を満たすことまで確認する
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

  test("the start script actually applies the contract before spawning", () => {
    // 契約モジュール側だけを検証しても、起動スクリプトが呼ぶのをやめたら意味がない。
    // 呼び出しが next start の spawn より前にあることまで固定する。
    const applyIndex = lhciStartSource.indexOf(
      "applyLhciProductionFallbacks()",
    );
    const spawnIndex = lhciStartSource.indexOf("Bun.spawn(");

    expect(applyIndex).toBeGreaterThan(-1);
    expect(spawnIndex).toBeGreaterThan(-1);
    expect(applyIndex).toBeLessThan(spawnIndex);
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

  test("nightly schedule runs Lighthouse CI with LCP/CLS/TBT budgets", () => {
    const start = ciWorkflow.indexOf("\n  lighthouse-ci:");
    const end = ciWorkflow.indexOf("\n  visual-regression:", start);
    const job = ciWorkflow.slice(start, end);
    expect(job).toContain("github.event_name == 'schedule'");

    // LHCI は budgetsFile と assertions を同時に受け付けない。
    // 閾値の正本は budget.json。autorun は同値を assertions に載せる。
    const budget = JSON.parse(
      readFileSync(join(process.cwd(), ".lighthouseci/budget.json"), "utf8"),
    ) as Array<{
      timings?: Array<{ metric: string; budget: number }>;
      resourceSizes?: Array<{ resourceType: string; budget: number }>;
    }>;
    const timings = budget[0]?.timings ?? [];
    const byMetric = Object.fromEntries(
      timings.map((row) => [row.metric, row.budget]),
    );
    expect(byMetric["largest-contentful-paint"]).toBe(4000);
    expect(byMetric["cumulative-layout-shift"]).toBe(0.1);
    expect(byMetric["total-blocking-time"]).toBe(300);

    const resourceSizes = budget[0]?.resourceSizes ?? [];
    expect(resourceSizes.length).toBeGreaterThan(1);
    const byResource = Object.fromEntries(
      resourceSizes.map((row) => [row.resourceType, row.budget]),
    );
    expect(byResource["script"]).toBe(560);
    expect(byResource["total"]).toBe(806.3330078125);

    const parsed = JSON.parse(lighthouserc) as {
      ci: { assert: { assertions: Record<string, unknown> } };
    };
    const readMax = (name: string): number | undefined => {
      const value = parsed.ci.assert.assertions[name];
      if (!Array.isArray(value)) return undefined;
      const opts = value[1];
      if (
        opts &&
        typeof opts === "object" &&
        "maxNumericValue" in opts &&
        typeof opts.maxNumericValue === "number"
      ) {
        return opts.maxNumericValue;
      }
      return undefined;
    };
    expect(readMax("largest-contentful-paint")).toBe(
      byMetric["largest-contentful-paint"],
    );
    expect(readMax("cumulative-layout-shift")).toBe(
      byMetric["cumulative-layout-shift"],
    );
    expect(readMax("total-blocking-time")).toBe(
      byMetric["total-blocking-time"],
    );
    expect(readMax("resource-summary:script:size")).toBe(560 * 1024);
    expect(readMax("resource-summary:total:size")).toBe(806.3330078125 * 1024);
    expect(readMax("resource-summary:script:size")).toBe(573440);
    expect(readMax("resource-summary:total:size")).toBe(825685);
    expect(lighthouserc).not.toContain("budgetsFile");
  });

  test("collects three runs and asserts the median", () => {
    // LHCI optimistic default is `max*` / `Math.min`, so more runs alone hide
    // regressions (`@lhci/utils/src/assertions.js:64-67`).
    const parsed = JSON.parse(lighthouserc) as {
      ci: {
        collect: { numberOfRuns: number };
        assert: { aggregationMethod?: string };
      };
    };
    expect({
      numberOfRuns: parsed.ci.collect.numberOfRuns,
      aggregationMethod: parsed.ci.assert.aggregationMethod,
    }).toEqual({ numberOfRuns: 3, aggregationMethod: "median" });
  });
});
