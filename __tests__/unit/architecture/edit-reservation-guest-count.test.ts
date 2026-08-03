import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

/**
 * 予約編集フォームが利用人数を**黙って切り詰めない**ことの gate。
 *
 * ## 何が起きていたか
 *
 * このフォームには「選択中スペースの定員を超えたら人数をその定員に書き換える」
 * 処理が 2 か所あった — `useEffect` での `change(String(spaceCapacity))` と、
 * 送信される hidden input の `Math.min(guestCount, spaceCapacity)`。
 *
 * 利用人数が DB に保存されていなかった頃は初期値が常に 1 だったので表面化しなかった。
 * 実際の人数を読むようになった時点で、**20 名の予約で定員 1 名のスペースを選ぶと
 * 人数が 1 に書き換わって送信が通り、記録まで 1 名に化ける**。サーバーの
 * `guestCountCapacityError` は「1 名なら定員 1 に収まる」と正しく判定するので、
 * client 側の切り詰めが定員 gate をそのまま無効化していた。管理者が現スペースの
 * 定員を下げた後の「時間だけの変更」でも同じ経路で記録が壊れる。
 *
 * ## なぜ静的検査か
 *
 * 本来は描画して確かめたいが、このフォームは `useActionState` / conform /
 * Turnstile / `next/navigation` に依存しており、初期値 1 か所のために harness を
 * 組む割に合わない。検査対象は「このファイルが送信値を定員で丸めていないこと」
 * という 1 ファイル・1 パターンに閉じた性質なので、ここでは本文を直接見る。
 *
 * `GuestStepper` 側の clamp（+ ボタンや直接入力を定員で止める）は**正しい**ので
 * 対象外。禁じるのは「利用者の操作なしに送信値が変わる」形だけ。
 */

const FORM = join(
  process.cwd(),
  "src/app/(public)/_shared/components/edit-reservation-form.tsx",
);

function formSource(): string {
  return readFileSync(FORM, "utf8");
}

/**
 * コメントを落としたコード本体。
 *
 * この gate 自身が最初にこれで落ちた: 上の禁止パターンを「以前こう書かれていた」と
 * **解説するコメント**が本文に入っており、コードは直っているのに検査が赤くなった。
 * 説明を書けなくなるのは本末転倒なので、照合対象からコメントを除く。
 */
function formCode(): string {
  return formSource()
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/^\s*\/\/.*$/gmu, "")
    .replace(/\s+/gu, " ");
}

describe("予約編集フォームの利用人数", () => {
  test("gate が空振りしていない", () => {
    const source = formSource();
    expect(source.length).toBeGreaterThan(1000);
    // 対象の識別子が存在すること（改名で検査が無意味になるのを防ぐ）
    expect(source).toContain("guestCount");
    expect(source).toContain("spaceCapacity");
  });

  test("送信値を定員で丸めない", () => {
    const code = formCode();
    // 送信される hidden input と、conform フィールドへの書き戻しの両方
    expect(code).not.toContain("Math.min(guestCount, spaceCapacity)");
    expect(code).not.toContain("change(String(spaceCapacity))");
  });

  test("コメント除去が効いている（gate 自身の誤検出防止）", () => {
    // 解説コメントには禁止パターンが載っている。それを拾ってしまうと、
    // コードが直っていても永久に赤いままになる。
    expect(formSource()).toContain("Math.min(guestCount, spaceCapacity)");
    expect(formCode()).not.toContain("Math.min(guestCount, spaceCapacity)");
  });

  test("定員超過は利用者に見える形で伝える", () => {
    const source = formSource();
    // 黙って直さない代わりに、超過していることを画面に出す責任がある
    expect(source).toContain("exceedsCapacity");
    expect(source).toMatch(/定員（\{spaceCapacity\}名）を超えています/u);
  });
});
