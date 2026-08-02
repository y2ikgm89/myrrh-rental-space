import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

/**
 * `seedSpaces` が既存行を**宣言へ収束させる**こと、かつ公開状態には触らないことの gate。
 *
 * ## なぜ収束が要るか
 *
 * 旧実装は既存 slug を見つけたら skip していた。`scripts/migrate-test-db.ts` は
 * `migrate deploy` しか流さないので、宣言を変えても既存の dev / test DB には
 * 永久に反映されない。ローカルだけが CI と静かに食い違う。
 *
 * 実害: `rate-plan-preview.smoke.spec.ts` がロックしている「¥1,430」は
 * `coworking-space.hourlyPrice: 500` から導出される。古い価格が残った DB では
 * 価格アサーションが落ち、原因は spec でも料金プランでもなく「seed が
 * 反映されていない」という見えにくい所にある。
 *
 * ## なぜ公開状態は書かないか
 *
 * `isPublished` / `isActive` / `reviewsEnabled` は管理画面と他 spec の領分。
 * `axe-admin-feature-disabled` 等が意図的に切り替えている最中に seed が
 * 書き戻すと相手を壊す。`locationId` / `categoryId` も同様に配置の話。
 *
 * ## なぜ本番では収束させないか
 *
 * `seedProduction` は `seedSpaces(false)` を呼ぶ。本番で収束させると
 * `--production` の再実行が管理画面の編集を踏み潰す。dev だけが収束する。
 */

const SEED = join(process.cwd(), "prisma/seed.ts");

function seedSpacesBody(): string {
  const source = readFileSync(SEED, "utf8");
  const body = /async function seedSpaces\([^)]*\)[\s\S]*?\n\}/u.exec(source);
  if (!body) throw new Error("seedSpaces が見つかりません");
  return body[0];
}

describe("seedSpaces の収束", () => {
  test("gate が空振りしていない", () => {
    expect(seedSpacesBody().length).toBeGreaterThan(500);
  });

  test("既存行を宣言内容へ収束させる（skip したままにしない）", () => {
    const body = seedSpacesBody();
    expect(body).toContain("prisma.space.update(");
    expect(body).toContain("reconcileDeclaredContent");
  });

  test("収束は dev 限定（本番は既存行に触らない）", () => {
    // `seedProduction` は `seedSpaces(false)` を呼ぶ。
    expect(seedSpacesBody()).toContain(
      "const reconcileDeclaredContent = overridePublished === undefined",
    );
    expect(readFileSync(SEED, "utf8")).toContain("await seedSpaces(false)");
  });

  test("公開状態・配置は収束対象から外す", () => {
    const body = seedSpacesBody();
    // update に渡す payload から除外していること。
    for (const field of [
      "isPublished: _isPublished",
      "isActive: _isActive",
      "reviewsEnabled: _reviewsEnabled",
      "locationId: _locationId",
      "categoryId: _categoryId",
      "slug: _slug",
    ]) {
      expect(body).toContain(field);
    }
  });
});
