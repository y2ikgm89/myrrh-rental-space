import "server-only";

import { isFeatureEnabled } from "@/shared/lib/features/check";

export interface FeedAlternates {
  readonly types: {
    readonly "application/rss+xml": string;
  };
}

/**
 * 公開 root layout の `alternates` を feature module 状態に応じて構築する。
 *
 * `posts` module OFF のとき `/feed.xml` は `notFound()` を返す (feed.xml/route.ts)。
 * その状態で `<link rel="alternate" type="application/rss+xml">` を無条件 emit すると、
 * RSS reader auto-discovery が 404 リンクを踏む。posts ON のときだけ emit する。
 *
 * exactOptionalPropertyTypes 下では `alternates: undefined` を明示代入できないため、
 * null 返却で「metadata に alternates キー自体を追加しない」を呼び出し側に spread で
 * 表現させる。
 */
export async function getFeedAlternates(): Promise<FeedAlternates | null> {
  if (!(await isFeatureEnabled("posts"))) {
    return null;
  }
  return {
    types: {
      "application/rss+xml": "/feed.xml",
    },
  };
}
