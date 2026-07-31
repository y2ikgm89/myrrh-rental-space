import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * 共有 DB のグローバル可変状態を触る E2E spec に「復元 hook」を機械強制する gate。
 *
 * 背景 (CI run 30617695076): `feature-module-off-gate.spec.ts` は
 * `Settings.featureModules` singleton を OFF にしてから `try { … } finally { 復元 }`
 * で戻していた。ところが **OFF への切替 (setup) は try の外**にあり、そこで throw
 * すると finally に入らず復元されない。結果 contact が OFF のまま残り、
 * `/contact` 404 → responsive-shell / inquiries / inquiry-reply が巻き添え、
 * admin サイドバーが feature-disabled 表示になって `axe-admin-pages` の
 * color-contrast が全滅し、**1 spec の失敗が 30 件超の偽の失敗**になった。
 *
 * `fullyParallel: true` + 共有 test DB という構成上、この汚染は spec 単位では
 * 検出できない。したがって「復元は必ず hook で行う」を静的に強制する。
 *
 * マーカーは `test.describe.serial`。testing-e2e.md の規約上、シングルトン行を
 * mutate する describe は serial 化が必須なので、これが「グローバル可変状態を
 * 触る spec」の実質的な検出条件になる（bun 側の `serial-db-test-detection.ts` が
 * content marker + opt-out で serial bucket を判定するのと同型）。
 */

const root = process.cwd();
const e2eRoot = join(root, "e2e");

/** prettier が `test.describe` と `.serial(` を改行分割するため `\s*` を挟む。 */
const SERIAL_DESCRIBE = /test\.describe\s*\.serial\s*\(/u;

/**
 * 復元 hook。**test 本体の `try/finally` は不可** — setup 段階で throw すると
 * finally に入らず、まさにそれが run 30617695076 の根本原因だった。
 */
const RESTORE_HOOK = /test\.(?:afterEach|afterAll)\s*\(/u;

/**
 * 直列化はするが「戻すべきグローバル可変状態」を持たない spec の opt-out。
 * 追加するときは必ず理由を書く（`SERIAL_DB_TEST_FORCE_EXCLUDE` と同じ運用）。
 */
const RESTORE_EXEMPT = new Map<string, string>([
  [
    "e2e/public/stripe-webhook-dedup-replay.spec.ts",
    "StripeEvent は append-only の dedup 台帳。直列化は event.id の重複配信契約を検証するためで、元に戻すべき可変状態を持たない",
  ],
]);

function listSpecFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listSpecFiles(full);
    return entry.isFile() && entry.name.endsWith(".spec.ts") ? [full] : [];
  });
}

function toPosixRelative(file: string): string {
  return relative(root, file).split(sep).join("/");
}

/** `test.describe.serial` を使う spec の repo 相対 path。 */
function findSerialSpecs(): string[] {
  return listSpecFiles(e2eRoot)
    .filter((file) => SERIAL_DESCRIBE.test(readFileSync(file, "utf8")))
    .map(toPosixRelative)
    .sort();
}

describe("E2E global state restore", () => {
  test("gate が空振りしていない", () => {
    // マーカーの正規表現が腐ると 0 件になり、以降の検査が全て通ってしまう。
    expect(findSerialSpecs().length).toBeGreaterThan(0);
  });

  test("serial spec は afterEach / afterAll で復元する（try/finally 不可）", () => {
    const missing = findSerialSpecs()
      .filter((rel) => !RESTORE_EXEMPT.has(rel))
      .filter(
        (rel) => !RESTORE_HOOK.test(readFileSync(join(root, rel), "utf8")),
      )
      .map(
        (rel) =>
          `${rel}: グローバル可変状態を触る serial spec に復元 hook が無い。test 本体の try/finally は setup 失敗時に入らないため afterEach / afterAll を使うこと（戻す状態が無いなら RESTORE_EXEMPT に理由付きで登録）`,
      );

    expect(missing).toEqual([]);
  });

  test("RESTORE_EXEMPT に stale なエントリが無い", () => {
    const serialSpecs = new Set(findSerialSpecs());

    const stale = [...RESTORE_EXEMPT.keys()]
      .filter((rel) => !serialSpecs.has(rel))
      .map(
        (rel) =>
          `${rel}: 既に serial spec ではない（削除・改名済みか serial を外した）。RESTORE_EXEMPT から外すこと`,
      );

    expect(stale).toEqual([]);
  });
});
