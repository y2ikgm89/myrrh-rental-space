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
 * マーカーは「`fullyParallel` を describe 単位で打ち消す宣言」。testing-e2e.md の
 * 規約上、シングルトン行を mutate する describe は順序固定が必須なので、これが
 * 「グローバル可変状態を触る spec」の実質的な検出条件になる（bun 側の
 * `serial-db-test-detection.ts` が content marker + opt-out で serial bucket を
 * 判定するのと同型）。
 *
 * 対象は 3 形:
 *
 * - `test.describe.serial(...)`
 * - `test.describe.configure({ mode: "default" })` — 順番に実行しつつ、失敗した
 *   test を**個別に**リトライする公式モード。`feature-module-off-gate` は
 *   「1 回の run で全 module の可否を出す」ため serial からこちらへ移した
 *   （serial は 1 本落ちると後続を全 skip する）。
 * - `test.describe.configure({ mode: "serial" })` — configure 経由の serial 宣言。
 *   serial の retry は describe を**先頭からやり直す**ため、復元漏れは retry 自体を
 *   壊す（`events-proxy-registration` は残った申込行が 2 周目に strict mode
 *   violation を起こし、retry が構造的に成功しなくなる）。
 */

const root = process.cwd();
const e2eRoot = join(root, "e2e");

/*
 * マーカーは全て **行頭**（インデントのみ許容）で照合する。JSDoc / `//` の解説文に
 * 現れた同じ文字列を拾わないため。実例: `rbac-viewer-write-blocked.spec.ts` は
 * 「role が固定になったため `test.describe.configure({ mode: "serial" })` も不要」と
 * 本文で説明しており、行頭固定にしないと configure 呼び出しが 1 つも無い spec を
 * 順序固定 spec として検出してしまう（`blacklist-reservation-block.spec.ts` /
 * `events-registration-toctou-capacity-1.spec.ts` にも同種の言及がある）。
 * 実コードの宣言は prettier が必ず行頭（+インデント）に置く。
 */

/** prettier が `test.describe` と `.serial(` を改行分割するため `\s*` を挟む。 */
const SERIAL_DESCRIBE = /^[ \t]*test\.describe\s*\.serial\s*\(/mu;

/** `test.describe.configure({ … mode: "default" … })`（複数行整形にも耐える）。 */
const DEFAULT_MODE_DESCRIBE =
  /^[ \t]*test\.describe\s*\.configure\s*\(\s*\{[^}]*\bmode:\s*"default"/mu;

/** `test.describe.configure({ … mode: "serial" … })`。 */
const SERIAL_MODE_DESCRIBE =
  /^[ \t]*test\.describe\s*\.configure\s*\(\s*\{[^}]*\bmode:\s*"serial"/mu;

/** `fullyParallel` を describe 単位で打ち消している = 順序に依存する spec。 */
function isSequencedSpec(source: string): boolean {
  return (
    SERIAL_DESCRIBE.test(source) ||
    DEFAULT_MODE_DESCRIBE.test(source) ||
    SERIAL_MODE_DESCRIBE.test(source)
  );
}

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
  [
    "e2e/authenticated/admin/events-broadcast.spec.ts",
    "配信フォームの唯一の書込は executeAdminMutationResult の AuditLog（絶対規約 9 で append-only）。broadcastEventAction は自コメントどおり event / registrations を変更せず、getEventBroadcastPayload は read-only、実送信を担う src/shared/lib/email/ は Prisma を一切 import しない（E2E は Resend 未設定で silent no-op）。直列化は admin event route の遅延コンパイル対策",
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

/** 順序固定を宣言している spec の repo 相対 path。 */
function findSerialSpecs(): string[] {
  return listSpecFiles(e2eRoot)
    .filter((file) => isSequencedSpec(readFileSync(file, "utf8")))
    .map(toPosixRelative)
    .sort();
}

describe("E2E global state restore", () => {
  test("gate が空振りしていない", () => {
    // マーカーの正規表現が腐ると 0 件になり、以降の検査が全て通ってしまう。
    expect(findSerialSpecs().length).toBeGreaterThan(0);
  });

  test("3 形のマーカーがそれぞれ現役（1 つだけ腐っても気付ける）", () => {
    const sources = listSpecFiles(e2eRoot).map((file) =>
      readFileSync(file, "utf8"),
    );

    expect(
      sources.filter((s) => SERIAL_DESCRIBE.test(s)).length,
    ).toBeGreaterThan(0);
    expect(
      sources.filter((s) => DEFAULT_MODE_DESCRIBE.test(s)).length,
    ).toBeGreaterThan(0);
    expect(
      sources.filter((s) => SERIAL_MODE_DESCRIBE.test(s)).length,
    ).toBeGreaterThan(0);
  });

  test("順序固定 spec は afterEach / afterAll で復元する（try/finally 不可）", () => {
    const missing = findSerialSpecs()
      .filter((rel) => !RESTORE_EXEMPT.has(rel))
      .filter(
        (rel) => !RESTORE_HOOK.test(readFileSync(join(root, rel), "utf8")),
      )
      .map(
        (rel) =>
          `${rel}: グローバル可変状態を触る順序固定 spec に復元 hook が無い。test 本体の try/finally は setup 失敗時に入らないため afterEach / afterAll を使うこと（戻す状態が無いなら RESTORE_EXEMPT に理由付きで登録）`,
      );

    expect(missing).toEqual([]);
  });

  test("RESTORE_EXEMPT に stale なエントリが無い", () => {
    const serialSpecs = new Set(findSerialSpecs());

    const stale = [...RESTORE_EXEMPT.keys()]
      .filter((rel) => !serialSpecs.has(rel))
      .map(
        (rel) =>
          `${rel}: 既に順序固定 spec ではない（削除・改名済みか順序固定を外した）。RESTORE_EXEMPT から外すこと`,
      );

    expect(stale).toEqual([]);
  });
});
