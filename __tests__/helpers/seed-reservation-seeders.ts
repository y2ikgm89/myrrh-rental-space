/**
 * `prisma/seed.ts` の中で「**`now` からの相対**で予約を作る」seed 関数を集める。
 *
 * ## なぜ名指しではなく導出なのか（監査 A-47）
 *
 * `seed-demo-reservation-rebuild.test.ts` と `seed-reservation-rebuild-safety.test.ts`
 * は抽出を `/async function seedReservations\(\)/` に固定していた。そのため
 * `seedDevCustomerAndReservations` が「marker があれば skip」のまま残っても
 * **どちらの gate も緑**で、`daysOffset: 7` / `16` の E2E fixture が初回 seed の
 * 暦日に貼り付いて古びていた（reservation-cancel-flow がローカルでだけ落ちる）。
 *
 * 「now 相対で予約を作る関数」という**性質**で集めれば、3 本目が増えたときも
 * 自動で検査対象に入る。名指しを 1 つ足し忘れた瞬間に穴が開く形へ戻さない。
 *
 * ## 抽出の粗さ
 *
 * top-level の `async function seedX() { … }` を「行頭 `}` まで」で切り出す
 * 粗い分割で、body に `daysOffset` と `reservation.create(` の両方があるものを採る。
 * seed.ts は 1 ファイルの手続きスクリプトで、列 0 に `}` が来るのは関数の終端だけ
 * という前提に乗っている。前提が崩れたら切り出しが短くなり、
 * 呼び出し側の assertion がまとめて落ちる（黙って通ることはない）。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export type SeedReservationSeeder = {
  readonly name: string;
  readonly body: string;
};

const SEED_PATH = join(process.cwd(), "prisma/seed.ts");

const SEED_FUNCTION = /async function (seed\w+)\(\)[\s\S]*?\n\}/gu;

export function readSeedSource(): string {
  return readFileSync(SEED_PATH, "utf8");
}

export function collectNowRelativeReservationSeeders(): SeedReservationSeeder[] {
  return [...readSeedSource().matchAll(SEED_FUNCTION)]
    .filter(
      (match) =>
        match[0].includes("daysOffset") &&
        match[0].includes("reservation.create("),
    )
    .map((match) => ({ name: match[1] ?? "", body: match[0] }));
}
