/**
 * FAQ 並び替えの order 割り当て。
 *
 * 削除は `deletedAt` を立てるだけで採番し直さないので、削除履歴のあるカテゴリでは
 * `order` が歯抜けになる。ページ位置から採番すると 2 ページ目のドラッグが
 * 1 ページ目末尾の order と衝突し、**以後そのカテゴリの 2 ページ目以降では
 * 並び替えが一切通らなくなる**（監査 F-32）。
 */

import { describe, expect, test } from "bun:test";

import { buildReorderPayload } from "@/app/(admin)/admin/(dashboard)/faq/_components/reorder-payload";

type Row = { id: string; order: number };

describe("buildReorderPayload", () => {
  test("歯抜けのある 2 ページ目でも、占めている order だけを入れ替える", () => {
    // 生存 24 件が order 1..24（order=0 の質問を削除した後）。perPage=20 なので
    // 2 ページ目は order 21..24。
    const visible: Row[] = [
      { id: "a", order: 21 },
      { id: "b", order: 22 },
      { id: "c", order: 23 },
      { id: "d", order: 24 },
    ];
    // 先頭を末尾へドラッグ。
    const reordered: Row[] = [
      { id: "b", order: 22 },
      { id: "c", order: 23 },
      { id: "d", order: 24 },
      { id: "a", order: 21 },
    ];

    const payload = buildReorderPayload(visible, reordered);

    // 使う値は元の 4 つのまま。**1 ページ目の order=20 を要求しない**。
    expect(payload).toEqual([
      { id: "b", order: 21 },
      { id: "c", order: 22 },
      { id: "d", order: 23 },
      { id: "a", order: 24 },
    ]);
    expect(payload.map((p) => p.order).sort((x, y) => x - y)).toEqual([
      21, 22, 23, 24,
    ]);
  });

  test("歯抜けが途中にあっても、その値をそのまま使う", () => {
    const visible: Row[] = [
      { id: "a", order: 3 },
      { id: "b", order: 7 },
      { id: "c", order: 9 },
    ];
    const reordered: Row[] = [
      { id: "c", order: 9 },
      { id: "a", order: 3 },
      { id: "b", order: 7 },
    ];

    expect(buildReorderPayload(visible, reordered)).toEqual([
      { id: "c", order: 3 },
      { id: "a", order: 7 },
      { id: "b", order: 9 },
    ]);
  });

  test("1 ページ目（0 始まりで連続）は従来どおり", () => {
    const visible: Row[] = [
      { id: "a", order: 0 },
      { id: "b", order: 1 },
      { id: "c", order: 2 },
    ];
    const reordered: Row[] = [
      { id: "b", order: 1 },
      { id: "a", order: 0 },
      { id: "c", order: 2 },
    ];

    expect(buildReorderPayload(visible, reordered)).toEqual([
      { id: "b", order: 0 },
      { id: "a", order: 1 },
      { id: "c", order: 2 },
    ]);
  });

  test("並び替えなし（同じ順序）なら order も変わらない", () => {
    const rows: Row[] = [
      { id: "a", order: 5 },
      { id: "b", order: 9 },
    ];

    expect(buildReorderPayload(rows, rows)).toEqual([
      { id: "a", order: 5 },
      { id: "b", order: 9 },
    ]);
  });
});
