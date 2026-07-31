import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildInitialFeatureModules,
  FEATURE_MODULES,
  FEATURE_MODULES_LIST,
} from "@/shared/lib/features/registry";

/**
 * `e2e/public/feature-module-off-gate.spec.ts` の `FEATURE_MODULE_BASELINE` と
 * registry SSoT の drift gate。
 *
 * 背景 (CI run 30617695076): 同 spec は `Settings.featureModules` singleton を
 * mutate する。復元対象が registry からずれると、OFF のまま取り残された module が
 * 共有 DB を汚染し **1 spec の失敗が run 全体に波及する**（実測で 30 件超の
 * 偽の失敗）。`e2e/**` は src から import しないため spec 側が値を再掲しており、
 * 静的に固定しないと registry 変更で無言に腐る。
 *
 * 固定する不変条件は 3 つ:
 *
 * 1. **網羅性** — `FeatureModulesForm` は 11 module を 1 つの form で送るため、
 *    どの保存も全 module を書き換えうる。依存元が OFF なら依存先は
 *    `submittedValue = depsMet ? control.value : ""` で道連れに OFF になるため、
 *    復元も全 module を対象にする必要がある
 * 2. **基準値** — E2E の webServer は `bun prisma/seed.ts --dev` を毎回実行し、
 *    `seedSettings({ resetFeatureModules: true })` が
 *    `buildInitialFeatureModules()` を書き込む。復元先はこれと一致させる
 * 3. **依存順** — 依存元が OFF の間、依存先の Switch は `disabled` かつ
 *    `aria-checked="false"`（ModuleSwitchRow の `checked={depsMet && isOn}` /
 *    `disabled={isPending || !depsMet}`）。依存先を先に click すると Playwright の
 *    actionability 待ちでハングし、復元そのものが失敗する
 */

const SPEC_PATH = "e2e/public/feature-module-off-gate.spec.ts";

interface ParsedBaseline {
  readonly id: string;
  readonly label: string;
  readonly enabled: boolean;
}

/** registry を id 文字列で引くための索引（literal union cast を避ける）。 */
const SEEDED_VALUES = buildInitialFeatureModules();

const REGISTRY_BY_ID = new Map(
  FEATURE_MODULES_LIST.map((id) => [
    String(id),
    {
      label: FEATURE_MODULES[id].label,
      requires: FEATURE_MODULES[id].requires ?? [],
      seeded: SEEDED_VALUES[id],
    },
  ]),
);

function parseSpecBaseline(): ParsedBaseline[] {
  const source = readFileSync(
    join(process.cwd(), ...SPEC_PATH.split("/")),
    "utf8",
  );

  const block =
    /const FEATURE_MODULE_BASELINE: readonly ModuleBaseline\[\] = \[([\s\S]*?)\n\];/u.exec(
      source,
    );
  if (!block?.[1]) {
    throw new Error(`FEATURE_MODULE_BASELINE block not found in ${SPEC_PATH}`);
  }

  return [
    ...block[1].matchAll(
      /id:\s*"([^"]+)",\s*label:\s*"([^"]+)",\s*enabled:\s*(true|false)/gu,
    ),
  ].map((m) => ({
    id: String(m[1]),
    label: String(m[2]),
    enabled: m[3] === "true",
  }));
}

describe("E2E feature module baseline sync", () => {
  test("gate が空振りしていない", () => {
    // 正規表現が壊れて 0 件パースになると以降の比較が全て通ってしまう。
    expect(parseSpecBaseline().length).toBe(FEATURE_MODULES_LIST.length);
  });

  test("全 module を網羅する（過不足なし）", () => {
    const parsed = parseSpecBaseline().map((entry) => entry.id);

    // 保存は 11 module 全部を送るため、1 つでも欠けると復元漏れになる。
    expect([...parsed].sort()).toEqual([...FEATURE_MODULES_LIST].sort());
  });

  test("label が registry の label と一致する", () => {
    const mismatched = parseSpecBaseline()
      .filter((entry) => REGISTRY_BY_ID.get(entry.id)?.label !== entry.label)
      .map(
        (entry) =>
          `${entry.id}: spec="${entry.label}" / registry="${REGISTRY_BY_ID.get(entry.id)?.label ?? "(未登録)"}"`,
      );

    expect(mismatched).toEqual([]);
  });

  test("enabled が buildInitialFeatureModules（seed が投入する値）と一致する", () => {
    const mismatched = parseSpecBaseline()
      .filter((entry) => REGISTRY_BY_ID.get(entry.id)?.seeded !== entry.enabled)
      .map(
        (entry) =>
          `${entry.id}: spec=${entry.enabled} / seed=${String(REGISTRY_BY_ID.get(entry.id)?.seeded)}`,
      );

    expect(mismatched).toEqual([]);
  });

  test("依存元が依存先より先に並ぶ（disabled Switch の click ハング防止）", () => {
    const parsed = parseSpecBaseline();
    const positionOf = new Map(parsed.map((entry, index) => [entry.id, index]));

    const violations = parsed.flatMap((entry, index) =>
      (REGISTRY_BY_ID.get(entry.id)?.requires ?? [])
        .filter((req) => (positionOf.get(req) ?? -1) > index)
        .map(
          (req) =>
            `${entry.id}（${index} 番目）が依存元 ${req}（${String(positionOf.get(req))} 番目）より先に並んでいる。依存元を先に復元しないと Switch が disabled のままで click がハングする`,
        ),
    );

    expect(violations).toEqual([]);
  });
});
