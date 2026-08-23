/**
 * **`take` に流れる件数には上限がある。**
 *
 * ## なぜ
 *
 * 監査 A-87: `paginate` は下限しか見ておらず（`Math.max(1, …)`）、JSDoc も
 * 「`limit` < 1 / 非整数 / undefined → 10 に clamp」と下限だけを宣言していた。
 * 入力側の `parseAsPerPage` にも上限が無い。
 *
 * その結果 `/admin/reservations?perPage=300000` が `take: 300000` として Prisma に届く。
 * admin は `max_instance_count = 1` / `memory = 1Gi` で、DB → Prisma オブジェクト →
 * RSC ペイロードの 3 重が同じヒープに載る。誰も攻撃していなくても、URL の桁を
 * 打ち間違えた 1 回で唯一のインスタンスが落ちうる（`statement_timeout` 15s が先に
 * 切ることの方が多いが、それでもその管理者は 500 を受ける）。
 *
 * リポジトリ内で上限を持っていたのは `dashboard/queries.ts` の `MAX_LIST_LIMIT = 50`
 * だけで、SSoT である `paginate` 側に無かった。
 *
 * ## 何を見るか
 *
 * 1. `paginate` が `MAX_PAGE_SIZE` へ clamp すること（下限・上限の両方）
 * 2. URL parser も同じ上限で clamp すること（表示 perPage と実 take を一致させる）
 * 3. UI が出す選択肢が `MAX_PAGE_SIZE` を超えないこと
 *    — 超えると「選べるのに反映されない」状態になる
 *
 * ## 直し方
 *
 * 選択肢を増やしたいときは `MAX_PAGE_SIZE` を上げる。UI 側のリストだけ増やさない。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { MAX_PAGE_SIZE, paginate } from "@/shared/lib/pagination";
import { parseAsMediaPerPage, parseAsPerPage } from "@/shared/lib/nuqs/parsers";

function readSource(...segments: string[]): string {
  return readFileSync(join(process.cwd(), ...segments), "utf8");
}

/** ソース中の `[10, 20, 50, 100]` 形の数値配列を読む。 */
function readNumberArray(source: string, marker: string): number[] {
  const at = source.indexOf(marker);
  if (at < 0) throw new Error(`${marker} が見つからない`);
  const open = source.indexOf("[", at);
  const close = source.indexOf("]", open);
  return source
    .slice(open + 1, close)
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isFinite(value));
}

describe("ページ件数の上限（A-87）", () => {
  test("paginate が上限へ clamp する", () => {
    expect(paginate({ limit: 1_000_000 })).toEqual({
      skip: 0,
      take: MAX_PAGE_SIZE,
      page: 1,
      limit: MAX_PAGE_SIZE,
    });

    // skip も clamp 後の limit で計算される（ページ送りが飛ばない）。
    expect(paginate({ page: 3, limit: 1_000_000 }).skip).toBe(
      MAX_PAGE_SIZE * 2,
    );
  });

  test("下限と既定は従来どおり", () => {
    expect(paginate({ limit: 0 }).take).toBe(1);
    expect(paginate({ limit: -5 }).take).toBe(1);
    expect(paginate({}).take).toBe(10);
    expect(paginate({ limit: 24.9 }).take).toBe(24);
    expect(paginate({ page: 2, limit: 20 })).toEqual({
      skip: 20,
      take: 20,
      page: 2,
      limit: 20,
    });
  });

  test("上限ちょうどは通す（境界）", () => {
    expect(paginate({ limit: MAX_PAGE_SIZE }).take).toBe(MAX_PAGE_SIZE);
  });

  test("URL parser も同じ上限で clamp する", () => {
    // 表示される perPage と実際の take がずれないよう、URL 段でも止める。
    expect(parseAsPerPage.parse("300000")).toBe(MAX_PAGE_SIZE);
    expect(parseAsMediaPerPage.parse("300000")).toBe(MAX_PAGE_SIZE);
    expect(parseAsPerPage.parse("0")).toBe(1);
    expect(parseAsPerPage.parse("20")).toBe(20);
    expect(parseAsPerPage.parse("not-a-number")).toBeNull();
  });

  test("UI の選択肢が上限を超えていない", () => {
    const listOptions = readNumberArray(
      readSource(
        "src",
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "_shared",
        "components",
        "ui",
        "Pagination.tsx",
      ),
      "DEFAULT_PER_PAGE_OPTIONS",
    );
    const mediaOptions = readNumberArray(
      readSource(
        "src",
        "app",
        "(admin)",
        "admin",
        "(dashboard)",
        "media",
        "_components",
        "MediaListWrapper.tsx",
      ),
      "perPageOptions=",
    );

    // 走査が空振りしていないこと（0 件なら Math.max が -Infinity になり素通りする）。
    expect(listOptions.length).toBeGreaterThan(2);
    expect(mediaOptions.length).toBeGreaterThan(2);

    expect({
      list: Math.max(...listOptions),
      media: Math.max(...mediaOptions),
      max: MAX_PAGE_SIZE,
    }).toEqual({
      list: 100,
      media: 96,
      max: MAX_PAGE_SIZE,
    });
    expect(Math.max(...listOptions, ...mediaOptions)).toBeLessThanOrEqual(
      MAX_PAGE_SIZE,
    );
  });
});
