import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

/**
 * `seedSettings` が **本番では既存 singleton に触らない**ことの gate。
 *
 * ## 何が起きていたか
 *
 * `seedProduction` は `seedSettings({ includeBusinessPlaceholders: false })` を呼ぶ。
 * settingsFeatures は既に `update: {}`（`resetFeatureModules` が無い限り）だが、
 * settingsSeo / settingsOrganization / settingsReservation は update に宣言全体を
 * 渡していた。`--production` を再実行するたびに、管理画面で直した siteName・
 * ロゴ URL・replyToEmail・キャンセル期限がテンプレート値（または null）に戻る。
 *
 * `--production` の再実行は運用中に普通に起こる（初期スタッフの追加など）。
 * seed は「無いものを作る」だけであるべきで、あるものを宣言へ引き戻してよいのは
 * 開発用 DB に限られる。
 *
 * ## 何を見るか
 *
 * `seedSettings` 本体で、上記 3 singleton の upsert `update` が
 * `includeBusinessPlaceholders === false` のとき `{}` であること。
 *
 * ## 直し方
 *
 * `update` を `includeBusinessPlaceholders ? <data> : {}` にする。create 経路と
 * `emailPlaceholders` / `seoData` の値は変えない。
 */

const SEED = join(process.cwd(), "prisma/seed.ts");

function seedSettingsBody(): string {
  const source = readFileSync(SEED, "utf8");
  const body = /async function seedSettings\([^)]*\)[\s\S]*?\n\}/u.exec(source);
  if (!body) throw new Error("seedSettings が見つかりません");
  return body[0];
}

function singletonUpdate(body: string, model: string): string {
  const match = new RegExp(
    `prisma\\.${model}\\.upsert\\(\\{[\\s\\S]*?\\bupdate:\\s*([^,\\n]+)`,
    "u",
  ).exec(body);
  if (!match?.[1]) {
    throw new Error(`${model} の upsert update が見つかりません`);
  }
  return match[1].trim();
}

describe("seedSettings の収束", () => {
  test("gate が空振りしていない", () => {
    expect(seedSettingsBody().length).toBeGreaterThan(500);
  });

  test("本番は SEO / 組織 / 予約 singleton の update を空にする", () => {
    const body = seedSettingsBody();
    for (const [model, data] of [
      ["settingsOrganization", "organizationData"],
      ["settingsReservation", "reservationData"],
      ["settingsSeo", "seoData"],
    ] as const) {
      expect(singletonUpdate(body, model)).toBe(
        `includeBusinessPlaceholders ? ${data} : {}`,
      );
    }
  });
});
