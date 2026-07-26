/**
 * Public route ↔ requireFeatureEnabled drift gate
 *
 * `src/app/(public)` 配下で feature module に紐づく page.tsx / route.ts、および
 * request-time に移した `*-feature-gate.tsx` は `await requireFeatureEnabled("<module>")`
 * を呼ぶ契約になっている (feature OFF 時に 404 fail-closed)。この enforcement は
 * grep gate でのみ検出可能 — ESLint も lint も検出しない。
 *
 * FEAT-3PLANE-02/-04: sibling gate 原則の対称化漏れが本 test が守る不変条件。
 * 過去に mypage/inquiries × 2 (contact)・reservation/complete (reservation)・
 * claim/reservation (reservation)・claim/event-registration (events) の 5 経路が
 * 対称化漏れしていた (FEAT-3PLANE-04 audit)。
 *
 * 新規 gate が必要な public route を追加したら `EXPECTED_GATES` に登録する。
 * 誤って登録漏れした route が本番デプロイされる前に fail する。
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, test, expect } from "bun:test";
import {
  FEATURE_MODULES_LIST,
  isFeatureModule,
} from "@/shared/lib/features/registry";

/**
 * feature module gate が必要な公開経路
 * (page.tsx / route.ts / `*-feature-gate.tsx` の相対パス) ↔ 期待される module id の SSoT。
 *
 * 新規経路追加時はここに登録。register 漏れ / module id 変更 / 呼び忘れは
 * 本 test が fail する。
 */
const EXPECTED_GATES: ReadonlyArray<{
  readonly file: string;
  readonly module: (typeof FEATURE_MODULES_LIST)[number];
}> = [
  // spaces
  { file: "src/app/(public)/spaces/page.tsx", module: "spaces" },
  { file: "src/app/(public)/spaces/[slug]/page.tsx", module: "spaces" },
  // reservation
  { file: "src/app/(public)/reservation/page.tsx", module: "reservation" },
  {
    file: "src/app/(public)/reservation/cancel/page.tsx",
    module: "reservation",
  },
  {
    file: "src/app/(public)/reservation/complete/page.tsx",
    module: "reservation",
  },
  {
    file: "src/app/(public)/reservation/status/page.tsx",
    module: "reservation",
  },
  {
    file: "src/app/(public)/reservation/status/edit/page.tsx",
    module: "reservation",
  },
  {
    file: "src/app/(public)/claim/reservation/page.tsx",
    module: "reservation",
  },
  {
    file: "src/app/(public)/mypage/reservations/[id]/edit/page.tsx",
    module: "reservation",
  },
  // events
  { file: "src/app/(public)/events/page.tsx", module: "events" },
  // PPR/CDN: page shell は静的、gate は Suspense 内 `*-feature-gate.tsx` + connection()
  {
    file: "src/app/(public)/events/[slug]/_components/event-detail-feature-gate.tsx",
    module: "events",
  },
  { file: "src/app/(public)/events/cancel/page.tsx", module: "events" },
  {
    file: "src/app/(public)/events/registrations/status/page.tsx",
    module: "events",
  },
  {
    file: "src/app/(public)/events/waitlist/checkout/route.ts",
    module: "events",
  },
  {
    file: "src/app/(public)/events/waitlist/checkout/route.ts",
    module: "payment",
  },
  {
    file: "src/app/(public)/events/waitlist/checkout-error/page.tsx",
    module: "events",
  },
  {
    file: "src/app/(public)/events/waitlist/confirm/page.tsx",
    module: "events",
  },
  {
    file: "src/app/(public)/events/waitlist/expired/page.tsx",
    module: "events",
  },
  { file: "src/app/(public)/mypage/events/page.tsx", module: "events" },
  {
    file: "src/app/(public)/mypage/events/[id]/page.tsx",
    module: "events",
  },
  {
    file: "src/app/(public)/claim/event-registration/page.tsx",
    module: "events",
  },
  {
    file: "src/app/(public)/events/registrations/checkout-error/page.tsx",
    module: "events",
  },
  {
    file: "src/app/(public)/events/registrations/payment-result/page.tsx",
    module: "events",
  },
  {
    file: "src/app/(public)/events/registrations/payment-result/page.tsx",
    module: "payment",
  },
  {
    file: "src/app/(public)/events/registrations/checkout/[token]/route.ts",
    module: "events",
  },
  {
    file: "src/app/(public)/events/registrations/checkout/[token]/route.ts",
    module: "payment",
  },
  // posts
  { file: "src/app/(public)/blog/page.tsx", module: "posts" },
  { file: "src/app/(public)/blog/[slug]/page.tsx", module: "posts" },
  { file: "src/app/(public)/category/[slug]/page.tsx", module: "posts" },
  { file: "src/app/(public)/tag/[slug]/page.tsx", module: "posts" },
  // news
  { file: "src/app/(public)/news/page.tsx", module: "news" },
  { file: "src/app/(public)/news/[slug]/page.tsx", module: "news" },
  // faq
  { file: "src/app/(public)/faq/page.tsx", module: "faq" },
  // access
  { file: "src/app/(public)/access/page.tsx", module: "access" },
  // contact
  { file: "src/app/(public)/contact/page.tsx", module: "contact" },
  { file: "src/app/(public)/mypage/inquiries/page.tsx", module: "contact" },
  {
    file: "src/app/(public)/mypage/inquiries/[id]/page.tsx",
    module: "contact",
  },
] as const;

const FEATURE_GATE_PATTERN =
  /await requireFeatureEnabled\(\s*["']([^"']+)["']\s*\)/g;

const PUBLIC_APP_ROOT = join(process.cwd(), "src/app/(public)");

function collectPublicGateFiles(): string[] {
  const files: string[] = [];

  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const abs = join(dir, entry);
      if (statSync(abs).isDirectory()) {
        walk(abs);
        continue;
      }
      if (
        entry === "page.tsx" ||
        entry === "route.ts" ||
        entry.endsWith("-feature-gate.tsx")
      ) {
        files.push(abs.replace(/\\/g, "/"));
      }
    }
  }

  walk(PUBLIC_APP_ROOT);
  return files;
}

function gateKey(file: string, moduleId: string): string {
  return `${file}::${moduleId}`;
}

function toRepoRelativePath(absPath: string): string {
  return absPath
    .replace(/\\/g, "/")
    .slice(process.cwd().replace(/\\/g, "/").length + 1);
}

describe("public route ↔ requireFeatureEnabled drift gate", () => {
  test("EXPECTED_GATES の全 module id は registry に存在する", () => {
    for (const entry of EXPECTED_GATES) {
      expect(isFeatureModule(entry.module)).toBe(true);
    }
  });

  for (const entry of EXPECTED_GATES) {
    test(`${entry.file} は requireFeatureEnabled("${entry.module}") を呼ぶ`, () => {
      const abs = join(process.cwd(), entry.file);
      const source = readFileSync(abs, "utf-8");
      const matches = [...source.matchAll(FEATURE_GATE_PATTERN)];
      const modules = matches
        .map((m) => m[1])
        .filter((s): s is string => Boolean(s));
      expect(modules).toContain(entry.module);
    });
  }

  test("EXPECTED_GATES に file::module の重複エントリがない", () => {
    const keys = EXPECTED_GATES.map((e) => gateKey(e.file, e.module));
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("src/app/(public) の page.tsx / route.ts / *-feature-gate.tsx の requireFeatureEnabled と EXPECTED_GATES が一致する", () => {
    const expected = new Set(
      EXPECTED_GATES.map((e) => gateKey(e.file, e.module)),
    );
    const actual = new Set<string>();

    for (const abs of collectPublicGateFiles()) {
      const source = readFileSync(abs, "utf-8");
      const matches = [...source.matchAll(FEATURE_GATE_PATTERN)];
      if (matches.length === 0) continue;

      const rel = toRepoRelativePath(abs);
      for (const match of matches) {
        const moduleId = match[1];
        if (!moduleId) continue;
        actual.add(gateKey(rel, moduleId));
      }
    }

    expect(actual).toEqual(expected);
  });
});
