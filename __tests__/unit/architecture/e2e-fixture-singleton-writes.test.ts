import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

/**
 * E2E fixture が **settings singleton を書き換えない**ことの gate。
 *
 * ## なぜ
 *
 * `settings*` は 1 行しかない共有状態で、fixture が書き換えて戻さないと
 * **seed が作れる状態と実 DB が恒久的に食い違う**。ローカルだけ CI と挙動が変わり、
 * 原因が「昔どこかの fixture が立てたフラグ」なので追跡が難しい。
 *
 * 実測: `create-passcode-reveal-fixture` が
 * `settingsSwitchbot.switchbotEnabled` を true にして戻していなかった。
 * seed が作れるのは schema 既定の false なので、fixture を一度でも走らせた DB は
 * 以後ずっと true のままだった。
 *
 * ## なぜ「復元 hook を足す」ではないのか
 *
 * `.claude/rules/testing-e2e.md` が記録しているとおり、本体が timeout すると
 * page も context も閉じられ、hook は走っても仕事ができない（run 30672479398）。
 * **書き換え自体をやめて seed の宣言に移す**ほうが構造的に強い。
 * fixture 側は「前提が満たされているか」を確認して、駄目なら名指しで落とす。
 *
 * 既存の `e2e-global-state-restore.test.ts` は describe の実行モードを marker に
 * するため、**spec ではない fixture script を構造的に見られない**。この gate が
 * その隙間を埋める。
 */

const root = process.cwd();

function listFixtureScripts(): string[] {
  return readdirSync(join(root, "scripts/e2e"))
    .filter((name) => name.endsWith(".ts"))
    .map((name) => `scripts/e2e/${name}`)
    .sort();
}

function read(file: string): string {
  return readFileSync(join(root, file), "utf8");
}

/** `prisma.settingsXxx.upsert/update/create` — singleton への書き込み。 */
const SINGLETON_WRITE =
  /prisma\.settings\w*\.(?:upsert|update|updateMany|create)\(/u;

/**
 * 例外。**per-test の変更ではなく bootstrap の provisioning** だけが許される。
 * 追加するときは必ず理由を書く（`RESTORE_EXEMPT` と同じ運用）。
 */
const SINGLETON_WRITE_EXEMPT = new Map<string, string>([
  [
    "scripts/e2e/setup-stripe-webhook-fixture.ts",
    "webServer chain（playwright.config.ts の e2eWebServerCommand、seed の直後）から 1 度だけ走る provisioning。E2E DB 全体で決済を有効にするのが目的なので、書いたまま残すのが正しい。テスト中に切り替える性質のものではない",
  ],
]);

describe("E2E fixture は settings singleton を書き換えない", () => {
  test("gate が空振りしていない", () => {
    const scripts = listFixtureScripts();
    expect(scripts.length).toBeGreaterThan(5);
    // singleton を**読む** fixture は存在してよい（前提確認）。
    expect(
      scripts.some((file) => /prisma\.settings\w*\.find/u.test(read(file))),
    ).toBe(true);
  });

  test("fixture script が settings singleton を書き換えていない", () => {
    const violations = listFixtureScripts()
      .filter((file) => !SINGLETON_WRITE_EXEMPT.has(file))
      .filter((file) => SINGLETON_WRITE.test(read(file)))
      .map(
        (file) =>
          `${file}: settings singleton を書き換えている。戻せないので seed の宣言（seedSettings）へ移し、fixture 側は前提確認だけにすること`,
      );

    expect(violations).toEqual([]);
  });

  test("SINGLETON_WRITE_EXEMPT に stale なエントリが無い", () => {
    const stale = [...SINGLETON_WRITE_EXEMPT.keys()]
      .filter((file) => !SINGLETON_WRITE.test(read(file)))
      .map(
        (file) =>
          `${file}: もう singleton を書いていない。SINGLETON_WRITE_EXEMPT から外すこと`,
      );

    expect(stale).toEqual([]);
  });

  test("SwitchBot の有効化は seed が宣言する", () => {
    const seed = readFileSync(join(root, "prisma/seed.ts"), "utf8");
    expect(seed).toContain("switchbotEnabled: true");
    // 本番テンプレートには効かせない。
    expect(seed).toContain("enableDevOnlyIntegrations");
  });
});
