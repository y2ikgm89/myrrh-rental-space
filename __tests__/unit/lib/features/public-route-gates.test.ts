/**
 * Public route ↔ requireFeatureEnabled drift gate
 *
 * `src/app/(public)` 配下で feature module に紐づく page.tsx / route.ts は
 * 冒頭で `await requireFeatureEnabled("<module>")` を呼ぶ契約になっている
 * (feature OFF 時に 404 fail-closed)。この enforcement は grep gate でのみ
 * 検出可能 — ESLint も lint も検出しない。
 *
 * FEAT-3PLANE-02/-04: sibling gate 原則の対称化漏れが本 test が守る不変条件。
 * 過去に mypage/inquiries × 2 (contact)・reservation/complete (reservation)・
 * claim/reservation (reservation)・claim/event-registration (events) の 5 経路が
 * 対称化漏れしていた (FEAT-3PLANE-04 audit)。
 *
 * 新規 gate が必要な public route を追加したら `EXPECTED_GATES` に登録する。
 * 誤って登録漏れした route が本番デプロイされる前に fail する。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, expect } from "bun:test";
import {
  FEATURE_MODULES_LIST,
  isFeatureModule,
} from "@/shared/lib/features/registry";

/**
 * feature module gate が必要な公開経路 (page.tsx / route.ts の相対パス) ↔
 * 期待される module id の SSoT。
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
    file: "src/app/(public)/claim/reservation/page.tsx",
    module: "reservation",
  },
  {
    file: "src/app/(public)/mypage/reservations/[id]/edit/page.tsx",
    module: "reservation",
  },
  {
    file: "src/app/(public)/mypage/reservations/[id]/page.tsx",
    module: "reservation",
  },
  // events
  { file: "src/app/(public)/events/page.tsx", module: "events" },
  { file: "src/app/(public)/events/[slug]/page.tsx", module: "events" },
  { file: "src/app/(public)/events/cancel/page.tsx", module: "events" },
  {
    file: "src/app/(public)/events/waitlist/checkout/[token]/route.ts",
    module: "events",
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
    file: "src/app/(public)/claim/event-registration/page.tsx",
    module: "events",
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

const FEATURE_GATE_PATTERN = /requireFeatureEnabled\(\s*["']([^"']+)["']\s*\)/g;

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

  test("EXPECTED_GATES に重複エントリがない", () => {
    const files = EXPECTED_GATES.map((e) => e.file);
    const unique = new Set(files);
    expect(unique.size).toBe(files.length);
  });
});
