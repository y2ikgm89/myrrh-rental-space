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
 * 実測が記録しているとおり、本体が timeout すると
 * page も context も閉じられ、hook は走っても仕事ができない（run 30672479398）。
 * **書き換え自体をやめて seed の宣言に移す**ほうが構造的に強い。
 * fixture 側は「前提が満たされているか」を確認して、駄目なら名指しで落とす。
 *
 * 既存の `e2e-global-state-restore.test.ts` は describe の実行モードを marker に
 * するため、**spec ではない fixture script を構造的に見られない**。この gate が
 * その隙間を埋める。
 *
 * ## 走査範囲（監査 F-83 で直した）
 *
 * 母集合は `scripts/e2e/` **と** `e2e/helpers/`。判定は receiver 非依存。
 *
 * 旧実装は `scripts/e2e/` だけを `readdirSync` し、正規表現も `prisma.` 決め打ち
 * だったため、`e2e/helpers/refund-policy-bulk-cancel-fixture.ts` の
 * `client.settingsCommerce.update(...)` を**置き場と receiver 名の両方**で
 * 素通りさせていた。同ディレクトリの `e2e-fixture-space-ownership.test.ts` は
 * 同じ穴を踏んで既に `e2e/helpers/` まで広げており、この gate だけが残っていた。
 *
 * ## 免除には機械検査が要る
 *
 * `SINGLETON_WRITE_EXEMPT` は理由を書けば通る自由記述ではない。**kind ごとに、
 * その主張が本当かをこの gate が確かめる**（散文で「安全だ」と書くだけでは通らない
 * — `migration-squawk-ignore-is-breaking.test.ts` と同じ方針）。
 */

const root = process.cwd();

/** fixture の置き場（SSoT）。片方だけ見ると、もう片方が素通りする。 */
const FIXTURE_DIRECTORIES = ["scripts/e2e", "e2e/helpers"] as const;

function listFixtureScripts(): string[] {
  return FIXTURE_DIRECTORIES.flatMap((directory) =>
    readdirSync(join(root, directory))
      .filter((name) => name.endsWith(".ts"))
      .map((name) => `${directory}/${name}`),
  ).sort();
}

function read(file: string): string {
  return readFileSync(join(root, file), "utf8");
}

/**
 * `<receiver>.settingsXxx.upsert/update/create` — singleton への書き込み。
 *
 * receiver 名で縛らない。旧実装は `prisma.` 決め打ちで、`getE2EPrismaClient()` を
 * `client` に受けている fixture を丸ごと見落としていた（監査 F-83）。
 */
const SINGLETON_WRITE = /\.settings\w*\.(?:upsert|update|updateMany|create)\(/u;

/** 同じ singleton を**読む**（snapshot を取る）呼び出し。 */
const SINGLETON_READ = /\.settings\w*\.find\w*\(/u;

type ExemptKind =
  /**
   * bootstrap の provisioning。webServer chain から 1 度だけ走り、E2E DB 全体の
   * 前提を作る。書いたまま残すのが正しい。
   */
  | "provisioning"
  /**
   * snapshot → 変更 → teardown で復元。**page / context に触らない独立 client**
   * でやるものに限る。
   *
   * gate の docstring が記録している失敗モード（timeout で page も context も
   * 閉じられ、hook は走っても仕事ができない）は、**page/context に依存する
   * teardown の話**。独立 client で書き戻す fixture には当てはまらない。
   * 実測の `create-passcode-reveal-fixture` は復元処理そのものが無かった。
   *
   * それでも既定は「書き換えない」。この kind は、seed 宣言へ移すと
   * **全テストと dev DB の挙動が変わってしまう**値にだけ許す。
   */
  | "snapshot-restore";

/**
 * 例外。追加するときは kind と理由を書く（`RESTORE_EXEMPT` と同じ運用）。
 * kind ごとの主張は下の test が機械で確かめる。
 */
const SINGLETON_WRITE_EXEMPT = new Map<
  string,
  { kind: ExemptKind; reason: string }
>([
  [
    "scripts/e2e/setup-stripe-webhook-fixture.ts",
    {
      kind: "provisioning",
      reason:
        "webServer chain（playwright.config.ts の e2eWebServerCommand、seed の直後）から 1 度だけ走る provisioning。E2E DB 全体で決済を有効にするのが目的なので、書いたまま残すのが正しい。テスト中に切り替える性質のものではない",
    },
  ],
  [
    "e2e/helpers/refund-policy-bulk-cancel-fixture.ts",
    {
      kind: "snapshot-restore",
      reason:
        "SettingsCommerce.refundPolicy を 50% tier に差し替えて bulk-cancel の返金額を検証する。seed の宣言へ移すと全テストと dev DB の返金挙動が変わるので移せない。復元は teardownRefundPolicyBulkCancelFixture が独立 PrismaClient（e2e/helpers/e2e-prisma.ts）で行い、page / context に触らない。消費側 spec は describe.serial + afterAll で、その配線は e2e-global-state-restore.test.ts が強制している",
    },
  ],
]);

describe("E2E fixture は settings singleton を書き換えない", () => {
  test("gate が空振りしていない", () => {
    const scripts = listFixtureScripts();
    // 走査規模の下限。片方のディレクトリが消えた / リネームされたら落ちる。
    expect(scripts.length).toBeGreaterThan(20);
    for (const directory of FIXTURE_DIRECTORIES) {
      expect(
        scripts.filter((file) => file.startsWith(`${directory}/`)).length,
      ).toBeGreaterThan(5);
    }
    // singleton を**読む** fixture は存在してよい（前提確認）。
    expect(scripts.some((file) => SINGLETON_READ.test(read(file)))).toBe(true);
    // 判定の見本: 免除に載っている書き込みは、実際に regex が拾えていること。
    // 拾えなくなったら（receiver 名の変更・regex の書き崩し）ここで落ちる。
    for (const file of SINGLETON_WRITE_EXEMPT.keys()) {
      expect(SINGLETON_WRITE.test(read(file))).toBe(true);
    }
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

  test("snapshot-restore の免除は、実際に snapshot と復元を持っている", () => {
    // 「安全だ」と散文で書くだけでは通さない。粗い判定であることは承知のうえで、
    // **3 つとも欠けていない**ことだけは機械で確かめる:
    //   1. 変更前に同じ singleton を読んでいる（snapshot）
    //   2. teardown の口がある（復元の入口）
    //   3. page / context に触っていない（timeout 時に死ぬ経路を使っていない）
    const violations = [...SINGLETON_WRITE_EXEMPT.entries()]
      .filter(([, entry]) => entry.kind === "snapshot-restore")
      .flatMap(([file]) => {
        const source = read(file);
        const problems: string[] = [];
        if (!SINGLETON_READ.test(source)) {
          problems.push("変更前の snapshot（settings*.find*）が無い");
        }
        if (!/export\s+async\s+function\s+teardown\w*/u.test(source)) {
          problems.push("teardown の export が無い");
        }
        if (/\bfrom\s+"@playwright\/test"/u.test(source)) {
          problems.push(
            "@playwright/test に依存している（page / context 経路は timeout で死ぬ）",
          );
        }
        return problems.map((problem) => `${file}: ${problem}`);
      });

    expect(violations).toEqual([]);
  });

  test("SwitchBot の有効化は seed が宣言する", () => {
    const seed = readFileSync(join(root, "prisma/seed.ts"), "utf8");
    expect(seed).toContain("switchbotEnabled: true");
    // 本番テンプレートには効かせない。
    expect(seed).toContain("enableDevOnlyIntegrations");
  });
});
