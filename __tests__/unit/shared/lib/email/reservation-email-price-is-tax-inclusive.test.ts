/**
 * 予約メールの「料金」が税込であることの gate。
 *
 * ## なぜ
 *
 * `Reservation.totalPrice` は**割引後・税抜**、`totalPriceWithTax` が税込合計で、
 * Stripe charge / 返金上限 / 領収書金額の SSoT。公開ページも領収書 PDF も税込を出す。
 *
 * ところが確認メールの「料金:」は税抜の `totalPrice` を、**税抜と明示せずに**出して
 * いた（監査 F-74）。payment feature OFF の運用では同じメールに「お振込先」が並ぶため、
 * **顧客はメール記載の税抜額を振り込み、税額ぶん不足する**（税抜 8,000 円 / 10% なら
 * 800 円不足）。同じ欠陥が変更通知・ステータス更新・管理者通知にもあり、
 * **返金メールだけは税込**だったので同一予約の中で税抜/税込が混在していた。
 *
 * ## 何を見るか
 *
 * 一次的な強制は**型**が持つ。`ReservationEmailData` / `StatusChangeEmailData` から
 * `totalPrice` を外したので、税抜を渡すと `tsc` が落ちる。
 *
 * この gate はその上で、**メール本文へ渡す式が実際に税込を読んでいること**を固定する。
 * 型は「渡せる値の集合」しか縛らないので、`totalPriceWithTax` を受け取っておきながら
 * 本文に別の値を出す実装は型では止まらない。
 *
 * ## 直し方
 *
 * 落ちたら `reservation-emails.ts` の該当箇所を `data.totalPriceWithTax` に戻す。
 * 税抜を出したいなら、まず「税抜である」とラベルする文言と、振込額との整合を
 * 決めること。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const EMAIL_MODULE = join(
  process.cwd(),
  "src",
  "shared",
  "lib",
  "email",
  "reservation-emails.ts",
);

const TYPES_MODULE = join(
  process.cwd(),
  "src",
  "shared",
  "lib",
  "email",
  "types.ts",
);

/** `totalPrice: formatPrice(data.<field>, …)` の `<field>` を拾う。 */
const TOTAL_PRICE_ARGS = /totalPrice:\s*formatPrice\(\s*data\.(\w+)/gu;

describe("予約メールの料金は税込", () => {
  const source = readFileSync(EMAIL_MODULE, "utf8");
  const args = [...source.matchAll(TOTAL_PRICE_ARGS)].map(
    (match) => match[1] ?? "",
  );

  test("gate が空振りしていない", () => {
    // 4 経路（確認・変更通知・ステータス更新・管理者通知）。
    // 0 件でも `toEqual([])` 系は緑になるので、下限を置く。
    expect(args.length).toBeGreaterThan(3);
  });

  test("すべての経路が税込を読んでいる", () => {
    const offenders = args.filter((field) => field !== "totalPriceWithTax");

    expect(offenders).toEqual([]);
  });

  test("型が税抜フィールドを持たない（渡せない）", () => {
    const types = readFileSync(TYPES_MODULE, "utf8");
    const emailData =
      /export type ReservationEmailData = \{[\s\S]*?\n\};/u.exec(types);
    const statusData =
      /export type StatusChangeEmailData = \{[\s\S]*?\n\};/u.exec(types);

    expect(emailData).not.toBeNull();
    expect(statusData).not.toBeNull();
    for (const block of [emailData?.[0] ?? "", statusData?.[0] ?? ""]) {
      expect(block).toContain("totalPriceWithTax: number | null;");
      // 元の欠陥そのものの形。
      expect(block).not.toContain("totalPrice: number | null;");
    }
  });
});
