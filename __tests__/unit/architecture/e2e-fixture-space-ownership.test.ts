import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { spaceFixtures } from "../../../e2e/fixtures/test-data";

/**
 * 時刻依存 E2E fixture が**専有するスペース**の所有分割を機械強制する gate。
 *
 * ## なぜ専有が要るのか
 *
 * `scripts/e2e/create-passcode-reveal-fixture.ts` は「解錠番号が今まさに有効」な
 * 状態を作るため、実行時刻をまたぐ CONFIRMED 予約を必要とする。予約は DB の
 * EXCLUDE 制約 `reservations_no_active_time_overlap_excl` で重複できないので、
 * seed のデモ当日予約と同じスペース・同じ時間帯を要求すると生成に失敗する。
 *
 * 旧実装は「窓が空いている公開スペースを探す」方式だった。実測（CI run
 * 30708064822、コンテナ TZ=UTC）ではデモ当日予約が 09-11 / 15-17、10-13 / 17-19、
 * 14-18 を占め、fixture が要求する `[now-1h, now+1h]` は **now が 16:00〜18:00 UTC
 * のとき 3 スペースすべてと衝突**する。落ちた run の起動は 16:24 UTC。
 * さらに nightly は `cron: "0 18 * * *"` で、15-17 の終端 17:00 と窓の開始が
 * **同時刻**という 0 秒差で通っていた。つまり「たまに落ちる」ではなく
 * **時間帯で決まる恒常的な失敗**だった。
 *
 * ## 何を強制するか
 *
 * 1. seed とテスト側で slug が一致している（二重定義の drift 防止）
 * 2. 専有スペースが seed のデモ予約対象（`DEMO_RESERVATION_SPACE_SLUGS`）に
 *    **含まれない** — これが「窓が必ず空いている」ことの実体
 * 3. 専有スペースが他の spec の所有スペースと交わらない
 * 4. fixture が slug を直書きせず `spaceFixtures` を参照している
 * 5. seed が専有スペースを**非公開**で作る（`/spaces` の visual baseline を動かさない）
 * 6. 専有スペースの作成が **dev seed 限定**（本番 seed に混入しない）
 */

/** `spaceFixtures` のうち fixture が専有する（= seed のデモ予約対象外の）もの。 */
const FIXTURE_OWNED_KEYS = new Set([
  "passcodeRevealSpaceSlug",
  "guestReservationSpaceSlug",
]);

const FIXTURE_OWNED_SLUGS = Object.entries(spaceFixtures)
  .filter(([key]) => FIXTURE_OWNED_KEYS.has(key))
  .map(([, slug]) => slug);

const root = process.cwd();
const SEED = join(root, "prisma/seed.ts");
const FIXTURE = join(root, "scripts/e2e/create-passcode-reveal-fixture.ts");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

/** `scripts/e2e/*.ts` の一覧（repo 相対）。 */
function listFixtureScripts(): string[] {
  return readdirSync(join(root, "scripts/e2e"))
    .filter((name) => name.endsWith(".ts"))
    .map((name) => `scripts/e2e/${name}`)
    .sort();
}

/** `const NAME = "value";` の value を取り出す。 */
/** `const NAME = [ "a", "b" ] as const;` の要素を取り出す。 */
function readStringArrayConst(source: string, name: string): string[] {
  const block = new RegExp(
    `const ${name} = \\[([\\s\\S]*?)\\] as const;`,
    "u",
  ).exec(source);
  if (!block?.[1]) {
    throw new Error(`${name} の宣言が見つかりません`);
  }
  return [...block[1].matchAll(/"([^"]+)"/gu)].map((m) => String(m[1]));
}

describe("時刻依存 E2E fixture の専有スペース", () => {
  test("seed とテスト fixture で slug が一致する", () => {
    // `E2E_FIXTURE_SPACES` は slug を定数参照で持つので、定数宣言側を突き合わせる。
    const source = read(SEED);
    // prettier は長い宣言を `=` の後で改行する。`\s*` を挟まないと折り返された
    // 定数だけ拾えず、gate が静かに 1 件しか見なくなる。
    const seedSlugs = [
      ...source.matchAll(/const E2E_\w*FIXTURE_SPACE_SLUG =\s*"([^"]+)";/gu),
    ].map((m) => String(m[1]));

    expect(seedSlugs.length).toBe(FIXTURE_OWNED_SLUGS.length);
    for (const slug of FIXTURE_OWNED_SLUGS) {
      expect(seedSlugs).toContain(slug);
    }

    // 宣言した定数が実際に `E2E_FIXTURE_SPACES` へ載っていること
    // （定数だけ増やして配列に足し忘れると seed がそのスペースを作らない）。
    const block = /const E2E_FIXTURE_SPACES = \[([\s\S]*?)\n\] as const/u.exec(
      source,
    );
    if (!block?.[1]) throw new Error("E2E_FIXTURE_SPACES が見つかりません");
    expect([...block[1].matchAll(/slug: E2E_\w+_SLUG/gu)].length).toBe(
      FIXTURE_OWNED_SLUGS.length,
    );
  });

  test("専有スペースには seed のデモ予約が載らない", () => {
    const demoSlugs = readStringArrayConst(
      read(SEED),
      "DEMO_RESERVATION_SPACE_SLUGS",
    );

    // gate が空振りしていないこと（正規表現が腐ると空配列になる）。
    expect(demoSlugs.length).toBeGreaterThan(0);
    for (const slug of FIXTURE_OWNED_SLUGS) {
      expect(demoSlugs).not.toContain(slug);
    }
  });

  test("専有スペース同士・公開スペースと交わらない", () => {
    // 1 fixture 1 スペース。相乗りさせると EXCLUDE 衝突が別の組み合わせで復活する。
    expect(new Set(FIXTURE_OWNED_SLUGS).size).toBe(FIXTURE_OWNED_SLUGS.length);

    const publicSlugs = Object.entries(spaceFixtures)
      .filter(([key]) => !FIXTURE_OWNED_KEYS.has(key))
      .map(([, slug]) => slug);
    expect(publicSlugs.length).toBeGreaterThan(0);
    for (const slug of FIXTURE_OWNED_SLUGS) {
      expect(publicSlugs).not.toContain(slug);
    }
  });

  test("fixture は slug を直書きせず spaceFixtures を参照する", () => {
    const violations = listFixtureScripts()
      .filter((file) => {
        const source = read(file);
        return FIXTURE_OWNED_SLUGS.some((slug) => source.includes(`"${slug}"`));
      })
      .map(
        (file) =>
          `${file}: 専有スペースの slug を直書きしている。二重定義の drift を gate が検出できなくなるので spaceFixtures 経由で参照すること`,
      );

    expect(violations).toEqual([]);
    expect(read(FIXTURE)).toContain("spaceFixtures.passcodeRevealSpaceSlug");
  });

  test("共有スペースに予約を作る fixture が残っていない", () => {
    // `coworking-space` は公開予約フロー / レビューの所有。ここに時刻固定の予約を
    // 作ると EXCLUDE 制約 `reservations_no_active_time_overlap_excl` で
    // 2 回目以降が落ちる（claim fixture は spec 本体から呼ばれ CI は retries: 2
    // なので、1 度残ると 3 attempt すべてが fixture 生成エラーになる）。
    const violations = listFixtureScripts()
      .filter((file) => {
        const source = read(file);
        return (
          /prisma\.reservation\.create\(/u.test(source) &&
          source.includes(`"${spaceFixtures.publicReservableSpaceSlug}"`)
        );
      })
      .map(
        (file) =>
          `${file}: 共有の ${spaceFixtures.publicReservableSpaceSlug} に予約を作っている。専有スペース（spaceFixtures.guestReservationSpaceSlug）を使うこと`,
      );

    expect(violations).toEqual([]);
  });

  test("fixture は空きスペースを探さない（探索方式へ逆戻りしていない）", () => {
    // 旧実装の marker。`reservations: { none: ... }` で「空いているスペース」を
    // 引く形に戻ると、再び時間帯依存の失敗が復活する。
    expect(read(FIXTURE)).not.toMatch(/reservations:\s*\{\s*none:/u);
  });

  test("seed は Pad デバイスを毎回揃え直す（skip しない）", () => {
    const body = /async function ensureFixtureSpace\([^)]*\)[\s\S]*?\n\}/u.exec(
      read(SEED),
    );
    if (!body) throw new Error("ensureFixtureSpace が見つかりません");

    // **`update:` ブロックだけ**を見る。`create:` 側にも同じ行があるので、
    // 関数全体への `toContain` では「既存行を揃え直さない」実装を検出できない
    // （実際そう書いて空振りした）。
    const updateBlock = /update:\s*\{([^}]*)\}/u.exec(body[0]);
    if (!updateBlock?.[1]) {
      throw new Error(
        "smartLockDevice.upsert の update ブロックが見つかりません",
      );
    }

    // `getPasscodeRevealState` は `!device.isActive` と非 Pad 型を弾く。
    // 既存行を揃え直さないと、非活性化された状態から再実行で復旧できず、
    // spec は「表示ボタンが出ない」という分かりにくい形で落ちる。
    expect(updateBlock[1]).toContain("isActive: true");
    expect(updateBlock[1]).toContain(
      "deviceType: SmartLockDeviceType.KEYPAD_TOUCH",
    );

    // 「紐づいていれば抜ける」early return への逆戻り検出。
    expect(body[0]).not.toMatch(
      /if \(space\.smartLockDeviceId\)[\s\S]{0,120}return;/u,
    );
  });

  test("seed は専有スペースを非公開で作る", () => {
    const source = read(SEED);
    const body = /async function ensureFixtureSpace\([^)]*\)[\s\S]*?\n\}/u.exec(
      source,
    );
    if (!body) throw new Error("ensureFixtureSpace が見つかりません");

    // 公開すると /spaces に出て visual baseline (`spaces-list.png`) が動く。
    expect(body[0]).toContain("isPublished: false");
    expect(body[0]).not.toMatch(/isPublished:\s*true/u);
  });

  test("専有スペースの作成は dev seed 限定（本番に混入しない）", () => {
    const source = read(SEED);
    // `seedProduction` は引数を取るので `\(\)` 決め打ちにしない。
    const devBody = /async function seedDev\([^)]*\)[\s\S]*?\n\}/u.exec(source);
    const prodBody = /async function seedProduction\([^)]*\)[\s\S]*?\n\}/u.exec(
      source,
    );
    if (!devBody || !prodBody) {
      throw new Error("seedDev / seedProduction が見つかりません");
    }

    expect(devBody[0]).toContain("await seedE2EFixtureSpaces();");
    expect(prodBody[0]).not.toContain("FixtureSpace");
  });
});
