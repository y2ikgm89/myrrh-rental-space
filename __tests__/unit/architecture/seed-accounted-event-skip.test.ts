import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

/**
 * 会計証跡があって作り直しを見送った event が、**見送りきる**ことを強制する gate。
 *
 * ## 何が中途半端だったか
 *
 * 1. **後段の申込 fixture が素通りしていた。** 見送りは delete/recreate の
 *    トランザクションだけを抜けるので、その後の「generic sample 3 件」
 *    「yoga の dev customer 1 件」「waitlist-test の 4 件」は普通に create していた。
 *    `EventRegistration` にこれらを一意にする制約は無いので、**再実行のたびに増える**。
 *    実測: 旧コードで 1 回 seed すると yoga の申込が 32 → 36 件になった。
 *    CONFIRMED が増えれば定員・待機列の E2E 契約が崩れる。
 * 2. **判定より前に event を update していた。** `firstSlotStartAt` /
 *    `lastSlotEndAt` は slot からの非正規化列で、`eventData` には実行時刻基準の
 *    新しい値が入る。先に書くと、古い slot を残したまま順序・表示用の列だけ
 *    新しくなり、「Skipped rebuilding」と言いながら中身が食い違う。
 */

const SEED = join(process.cwd(), "prisma/seed.ts");

function seedEventsBody(): string {
  const source = readFileSync(SEED, "utf8");
  const match = /async function seedEvents\([^)]*\)[\s\S]*?\n\}/u.exec(source);
  if (!match) {
    throw new Error("seedEvents が見つかりません");
  }
  return match[0];
}

describe("会計証跡付き event の見送り", () => {
  test("判定は event を書き換える前に行う", () => {
    const body = seedEventsBody();

    const checkAt = body.indexOf("const accountedRegistrations");
    const updateAt = body.indexOf("tx.event.update(");
    const createAt = body.indexOf("tx.event.create(");

    expect(checkAt).toBeGreaterThan(-1);
    expect(updateAt).toBeGreaterThan(-1);

    // 先に update すると、見送った event の非正規化列だけが新しくなる。
    expect(checkAt).toBeLessThan(updateAt);
    expect(checkAt).toBeLessThan(createAt);
  });

  test("見送った event を後段の申込 fixture から外している", () => {
    const body = seedEventsBody();

    expect(body).toContain("skippedEventIds.add(");

    // 後段で `eventRegistration.create` する箇所すべてが除外を通っていること。
    // 数で縛るのは、fixture を 1 つ足したときに除外を書き忘れても
    // gate が緑のまま通るのを防ぐため。
    const createCount = [
      ...body.matchAll(/prisma\.eventRegistration\.create\(/gu),
    ].length;
    const guardCount = [...body.matchAll(/skippedEventIds\.has\(/gu)].length;

    expect(createCount).toBeGreaterThan(0);
    expect(guardCount).toBe(createCount);
  });

  test("見送りの理由をログに名指しで出す", () => {
    const body = seedEventsBody();

    // 黙って skip すると「なぜ E2E の前提が揃わないのか」が追えなくなる。
    expect(body).toContain("Skipped rebuilding event");
    expect(body).toContain("ON DELETE RESTRICT");
  });
});
