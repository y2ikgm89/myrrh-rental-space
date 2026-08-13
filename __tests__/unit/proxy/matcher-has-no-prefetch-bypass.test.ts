/**
 * proxy の matcher が prefetch ヘッダで素通りしないことを固定する。
 *
 * ## なぜ
 *
 * Next の matcher における `missing` は「そのヘッダが**無い**ときだけ middleware を
 * 走らせる」という意味。かつて matcher には
 *
 * ```
 * missing: [
 *   { type: "header", key: "next-router-prefetch" },
 *   { type: "header", key: "purpose", value: "prefetch" },
 * ]
 * ```
 *
 * が入っており、**リクエストにヘッダを 1 本足すだけで `proxy()` のガードが丸ごと
 * 飛ぶ**状態だった。認証も署名も要らない。飛ぶのは:
 *
 * - `isBlockedOnPublicSurface` による surface 分離。両 surface は**同一ビルド**で
 *   `APP_SURFACE` は Cloud Run の runtime 変数なので、public のデプロイにも
 *   `/admin` `/api/admin` `/api/health` などのルートは存在する。この 404 が唯一の分離。
 * - `/api/**` の rate limit（webhook / cron バケットを含む）
 * - `createResponse` が付ける CSP を含むセキュリティヘッダ
 *
 * ## 何を見るか
 *
 * `proxy()` を呼ぶテストではこれを検出できない。**matcher は Next のルーティング設定で
 * あって実行時コードではない**ため、関数を直接呼ぶテストは matcher を通らない。
 * だから export された `config` そのものを検査する。
 *
 * ## 直し方
 *
 * 落ちたら matcher に `missing` / `has` が入っている。prefetch を除外したくなった
 * 理由が性能なら、**middleware の中で分岐する**（ガードは通したうえで、数える必要が
 * 無いものを数えない）。matcher で外すと、外れるのはガード全部になる。
 */
import { describe, expect, test } from "bun:test";

import { config } from "@/proxy";

type MatcherEntry =
  | string
  | {
      source: string;
      missing?: unknown[];
      has?: unknown[];
    };

describe("proxy matcher", () => {
  test("走査対象が空でない（gate 自体が空振りしていない）", () => {
    expect(Array.isArray(config.matcher)).toBe(true);
    expect(config.matcher.length).toBeGreaterThan(0);
  });

  test("ヘッダ条件で middleware を外す entry が無い", () => {
    for (const entry of config.matcher as MatcherEntry[]) {
      if (typeof entry === "string") continue;
      // `missing` は「このヘッダが無いときだけ走る」＝ヘッダを付ければ素通り。
      expect(entry.missing).toBeUndefined();
      // `has` も同型の穴（条件を満たさないリクエストが素通りする）。
      expect(entry.has).toBeUndefined();
    }
  });

  test("prefetch を指す文字列が matcher に現れない", () => {
    const serialized = JSON.stringify(config.matcher);
    expect(serialized).not.toContain("prefetch");
    expect(serialized).not.toContain("next-router-prefetch");
  });
});
