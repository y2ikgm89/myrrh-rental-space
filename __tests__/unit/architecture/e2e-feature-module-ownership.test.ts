import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  FEATURE_MODULES,
  FEATURE_MODULES_LIST,
} from "@/shared/lib/features/registry";

/**
 * `Settings.featureModules` を触る E2E spec の **所有分割** を機械強制する gate。
 *
 * ## なぜ所有分割なのか（他の手段が使えない）
 *
 * `Settings.featureModules` は singleton row。これを触る spec が複数あると
 * `fullyParallel: true` + 2 workers で衝突する。実際に衝突している:
 * `e2e/public/feature-module-off-gate.spec.ts` は `chromium` project、
 * `e2e/authenticated/admin/axe-admin-feature-disabled.spec.ts` は `chromium-admin`
 * project にあり、同時に走りうる。
 *
 * 排他の手段として却下したもの:
 *
 * - **`test.describe.serial`** — 直列化するのは同一 describe 内だけ。別ファイル・
 *   別 project には効かない
 * - **Playwright の named test lock**（`test("...", { lock: "..." })`）— ファイル・
 *   worker・project を跨いで排他する公式機能だが、**stable 未リリース**。
 *   1.61.1（本 repo pin）にも 1.62.1（最新 stable）にも存在せず、
 *   `TestDetails` は `annotation` / `tag` のみ。alpha を pin する選択は取らない
 * - **per-request の E2E ヘッダー上書き**（admin identity の `x-e2e-admin-identity`
 *   と同型）— feature 解決は `'use cache'` の内側で走る（`getPublicNavigation` は
 *   `"use cache"` 宣言後に `getFeatureFilterContext()` を呼ぶ）。`headers()` は
 *   `'use cache'` 内で呼べないため原理的に不可能
 *
 * 残る唯一の実効手段が「spec 間で所有 module を重複させない」。交わらなければ
 * 並走しても互いの検証対象を書き換えないので、排他自体が不要になる。
 *
 * ## 強制する不変条件
 *
 * 1. feature module を触る spec は `OWNED_FEATURE_MODULES` を宣言する
 * 2. 所有集合は spec 間で **交わらない**
 * 3. 所有集合は **依存カスケードで閉じている** — `spaces` を OFF にする保存は
 *    `submittedValue = depsMet ? control.value : ""` により `reservation` /
 *    `reviews` / `payment` も false にするので、それらも所有していなければ
 *    「自分が壊したのに直さない」module が出る
 * 4. label が registry SSoT と一致する
 * 5. 依存元が依存先より先に並ぶ — 依存元 OFF の間、依存先の Switch は
 *    `disabled` になり click が actionability 待ちでハングする
 */

const root = process.cwd();
const e2eRoot = join(root, "e2e");

/** registry を id 文字列で引くための索引（literal union cast を避ける）。 */
const REGISTRY_BY_ID = new Map(
  FEATURE_MODULES_LIST.map((id) => [
    String(id),
    {
      label: FEATURE_MODULES[id].label,
      requires: FEATURE_MODULES[id].requires ?? [],
    },
  ]),
);

const FEATURE_SETTINGS_PATH = "/admin/settings/features";

/**
 * 「feature module を mutate する spec」の判定。
 *
 * URL 文字列の出現だけでは足りない — `settings.spec.ts` や
 * `rbac-viewer-write-blocked.spec.ts` は `a[href="/admin/settings/features"]` の
 * 存在/不在を assert するだけの **read-only** で、所有宣言を要求するのは誤り。
 * 実際にフォームを操作できるのは設定ページへ **遷移した** spec だけなので、
 * 「features 設定ページへの `goto`」を marker にする。パス直書きと、パスを
 * 束縛した const 経由の両方を拾う（命名には依存しない）。
 */
function navigatesToFeatureSettings(source: string): boolean {
  if (new RegExp(`goto\\(\\s*"${FEATURE_SETTINGS_PATH}"`, "u").test(source)) {
    return true;
  }

  const boundIdentifiers = [
    ...source.matchAll(
      new RegExp(`const (\\w+) = "${FEATURE_SETTINGS_PATH}"`, "gu"),
    ),
  ].map((m) => String(m[1]));

  return boundIdentifiers.some((identifier) =>
    new RegExp(`goto\\(\\s*${identifier}\\b`, "u").test(source),
  );
}

interface SpecOwnership {
  readonly file: string;
  /** 宣言順（= 復元順）の module id */
  readonly ids: readonly string[];
  /** id → 宣言された label */
  readonly labels: ReadonlyMap<string, string>;
}

function listSpecFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listSpecFiles(full);
    return entry.isFile() && entry.name.endsWith(".spec.ts") ? [full] : [];
  });
}

/**
 * `const OWNED_FEATURE_MODULES = { id: "ラベル" | LABEL_CONST, ... } as const;`
 * を解析する。value が識別子の場合は同ファイル内の `const X = "..."` を引く。
 */
function parseOwnership(file: string, source: string): SpecOwnership | null {
  const block =
    /const OWNED_FEATURE_MODULES = \{([\s\S]*?)\n\} as const;/u.exec(source);
  if (!block?.[1]) return null;

  const ids: string[] = [];
  const labels = new Map<string, string>();

  for (const m of block[1].matchAll(/^\s*([A-Za-z][\w-]*):\s*(.+?),\s*$/gmu)) {
    const id = String(m[1]);
    const rawValue = String(m[2]).trim();
    ids.push(id);

    const literal = /^"([^"]*)"$/u.exec(rawValue);
    if (literal?.[1] !== undefined) {
      labels.set(id, literal[1]);
      continue;
    }

    // 識別子参照 → 同ファイルの const 宣言を引く
    const referenced = new RegExp(`const ${rawValue} = "([^"]+)"`, "u").exec(
      source,
    );
    if (referenced?.[1] !== undefined) labels.set(id, referenced[1]);
  }

  return { file, ids, labels };
}

/**
 * `const OWNED_MODULE_REQUIRES: ... = { id: ["dep", ...], ... };` を解析する。
 * 値はソート済みカンマ区切りに正規化して比較しやすくする。宣言が無ければ空 Map。
 */
function parseOwnedRequires(source: string): Map<string, string> {
  const block = /const OWNED_MODULE_REQUIRES[^=]*= \{([\s\S]*?)\n\};/u.exec(
    source,
  );
  const declared = new Map<string, string>();
  if (!block?.[1]) return declared;

  for (const m of block[1].matchAll(
    /^\s*([A-Za-z][\w-]*):\s*\[([^\]]*)\]/gmu,
  )) {
    const deps = [...String(m[2]).matchAll(/"([^"]+)"/gu)]
      .map((d) => String(d[1]))
      .sort();
    declared.set(String(m[1]), deps.join(","));
  }

  return declared;
}

function collectSpecs(): {
  mutating: string[];
  ownerships: SpecOwnership[];
} {
  const mutating: string[] = [];
  const ownerships: SpecOwnership[] = [];

  for (const file of listSpecFiles(e2eRoot)) {
    const source = readFileSync(file, "utf8");
    if (!navigatesToFeatureSettings(source)) continue;

    const rel = relative(root, file).split(sep).join("/");
    mutating.push(rel);

    const parsed = parseOwnership(rel, source);
    if (parsed) ownerships.push(parsed);
  }

  return { mutating: mutating.sort(), ownerships };
}

/** owned を起点に「OFF にすると道連れになる module」を推移的に集める。 */
function cascadeClosure(owned: ReadonlySet<string>): Set<string> {
  const closure = new Set(owned);
  let grew = true;

  while (grew) {
    grew = false;
    for (const id of FEATURE_MODULES_LIST) {
      if (closure.has(id)) continue;
      const requires = FEATURE_MODULES[id].requires ?? [];
      if (requires.some((req) => closure.has(req))) {
        closure.add(id);
        grew = true;
      }
    }
  }

  return closure;
}

describe("E2E feature module ownership", () => {
  test("gate が空振りしていない", () => {
    const { mutating, ownerships } = collectSpecs();

    // marker が腐ると 0 件になり、以降の検査が全て通ってしまう。
    expect(mutating.length).toBeGreaterThan(1);
    expect(ownerships.length).toBe(mutating.length);
  });

  test("feature module を触る spec は所有を宣言する", () => {
    const { mutating, ownerships } = collectSpecs();
    const declared = new Set(ownerships.map((o) => o.file));

    const missing = mutating
      .filter((file) => !declared.has(file))
      .map(
        (file) =>
          `${file}: Settings.featureModules を触るのに OWNED_FEATURE_MODULES の宣言が無い。所有 module を宣言して復元範囲をそこに限定すること`,
      );

    expect(missing).toEqual([]);
  });

  test("所有 module が spec 間で交わらない", () => {
    const { ownerships } = collectSpecs();
    const conflicts: string[] = [];

    for (let i = 0; i < ownerships.length; i++) {
      for (let j = i + 1; j < ownerships.length; j++) {
        const a = ownerships[i];
        const b = ownerships[j];
        if (!a || !b) continue;

        const shared = a.ids.filter((id) => b.ids.includes(id));
        if (shared.length > 0) {
          conflicts.push(
            `${a.file} と ${b.file} が ${shared.join(" / ")} を共有している。並走時に互いの検証対象を書き換えるため所有は排他にすること`,
          );
        }
      }
    }

    expect(conflicts).toEqual([]);
  });

  test("所有集合が依存カスケードで閉じている", () => {
    const { ownerships } = collectSpecs();

    const violations = ownerships.flatMap((o) => {
      const owned = new Set(o.ids);
      return [...cascadeClosure(owned)]
        .filter((id) => !owned.has(id))
        .map(
          (id) =>
            `${o.file}: ${id} を所有していないが、所有 module を OFF にする保存が ${id} も OFF に書き換える（依存カスケード）。所有に含めて復元対象にすること`,
        );
    });

    expect(violations).toEqual([]);
  });

  test("label が registry の label と一致する", () => {
    const { ownerships } = collectSpecs();

    const mismatched = ownerships.flatMap((o) =>
      o.ids
        .filter((id) => REGISTRY_BY_ID.get(id)?.label !== o.labels.get(id))
        .map(
          (id) =>
            `${o.file}: ${id} の label が spec="${o.labels.get(id) ?? "(解析不能)"}" / registry="${REGISTRY_BY_ID.get(id)?.label ?? "(未登録)"}"`,
        ),
    );

    expect(mismatched).toEqual([]);
  });

  test("所有 module の依存元も所有内にある（基準値を計算可能にする）", () => {
    const { ownerships } = collectSpecs();

    const violations = ownerships.flatMap((o) => {
      const owned = new Set(o.ids);
      return o.ids.flatMap((id) =>
        (REGISTRY_BY_ID.get(id)?.requires ?? [])
          .filter((req) => !owned.has(req))
          .map(
            (req) =>
              `${o.file}: ${id} の依存元 ${req} を所有していない。依存正規化後の基準値を決められないため所有に含めること`,
          ),
      );
    });

    expect(violations).toEqual([]);
  });

  test("OWNED_MODULE_REQUIRES が registry の requires と一致する", () => {
    const { ownerships } = collectSpecs();

    const mismatched = ownerships.flatMap((o) => {
      const source = readFileSync(join(root, o.file), "utf8");
      const declared = parseOwnedRequires(source);

      // registry 側の期待値: 所有 module のうち requires を持つものだけ
      const expected = new Map(
        o.ids
          .map((id) => [id, REGISTRY_BY_ID.get(id)?.requires ?? []] as const)
          .filter(([, requires]) => requires.length > 0)
          .map(([id, requires]) => [id, [...requires].sort().join(",")]),
      );

      const problems: string[] = [];
      for (const [id, want] of expected) {
        const got = declared.get(id);
        if (got !== want) {
          problems.push(
            `${o.file}: OWNED_MODULE_REQUIRES.${id} が "${got ?? "(未宣言)"}" だが registry は "${want}"`,
          );
        }
      }
      for (const id of declared.keys()) {
        if (!expected.has(id)) {
          problems.push(
            `${o.file}: OWNED_MODULE_REQUIRES.${id} は registry に requires が無い（または非所有）ので不要`,
          );
        }
      }
      return problems;
    });

    expect(mismatched).toEqual([]);
  });

  test("依存元が依存先より先に並ぶ（disabled Switch の click ハング防止）", () => {
    const { ownerships } = collectSpecs();

    const violations = ownerships.flatMap((o) => {
      const positionOf = new Map(o.ids.map((id, index) => [id, index]));
      return o.ids.flatMap((id, index) => {
        return (REGISTRY_BY_ID.get(id)?.requires ?? [])
          .filter((req) => (positionOf.get(req) ?? -1) > index)
          .map(
            (req) =>
              `${o.file}: ${id}（${index} 番目）が依存元 ${req}（${String(positionOf.get(req))} 番目）より先に並んでいる。依存元を先に復元しないと Switch が disabled のままで click がハングする`,
          );
      });
    });

    expect(violations).toEqual([]);
  });
});
