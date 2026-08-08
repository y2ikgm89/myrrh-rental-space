import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

describe("one-time backfill clean-break contract", () => {
  /**
   * 一度きりの修復スクリプトは**本番で流し終えてから**消す。
   *
   * 「列を DROP する PR で一緒に消す」ではない。DROP する migration は
   * 「適用前にこれを流せ」と書いてあり、その migration はまだ**適用されていない**。
   * PR の時点で消すと、デプロイする人が読む手順が実行不能になる
   * （実際 `backfill-special-holidays-to-blocked-dates.ts` がこの形で先に消され、
   * migration ヘッダだけが残った。migration は絶対規約 #7 で編集できないので、
   * 直せるのはスクリプト側だけだった）。
   *
   * ここに載せてよいのは「もう誰も実行できない／実行する必要が無い」ことが
   * 確認できたものだけ。判定は 2 通りある:
   *
   * 1. **本番で流し終えた**
   * 2. **流す対象そのものが存在しなくなった**
   *
   * `backfill-special-holidays-to-blocked-dates.ts` は 2 で消えた。移送元の
   * `locations.special_holidays` は schema.prisma にも baseline にも `src/` にも
   * 1 件も残っておらず（実測 0）、それを DROP する migration は baseline へ
   * 畳まれてヘッダごと消えている。本番は新しい空の DB へ切り替える方針なので、
   * 移送すべきデータも生まれない。**実行すると「列がこの DB に存在しない」で
   * 落ちるだけのスクリプト**になっていた。
   *
   * 参照が残ったまま消えていないかは
   * `migration-referenced-scripts-exist.test.ts` が別途強制する。
   */
  test("does not keep the retired one-off data repair scripts", () => {
    const removedScripts = [
      "backfill-page-hero-buttons.ts",
      "backfill-special-holidays-to-blocked-dates.ts",
      "migrate-gallery-images-to-media.ts",
      "update-access-sections.ts",
    ];

    for (const script of removedScripts) {
      expect(existsSync(join(process.cwd(), "scripts", script))).toBe(false);
    }
  });

  test("runtime source does not describe backward compatibility obligations", async () => {
    const checkedFiles = [
      "src/shared/lib/json-validators.ts",
      "src/shared/lib/pagination.ts",
      "src/shared/lib/r2/media-magic-bytes.ts",
    ];

    for (const relativePath of checkedFiles) {
      const source = await Bun.file(join(process.cwd(), relativePath)).text();
      expect(source).not.toMatch(
        /後方互換|backward-compatible|compatibility shim/iu,
      );
    }
  });
});
