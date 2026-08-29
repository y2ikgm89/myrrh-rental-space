import type { Route } from "next";
import { isSafeInternalRedirectPath } from "@/shared/lib/url/safe-internal-redirect";

export function isAppRoute(href: string): href is Route {
  return isSafeInternalRedirectPath(href);
}

export function toAppRoute(href: string): Route {
  // 否定分岐に入る前に `string` のまま控えを取る。
  //
  // `isAppRoute` は型述語なので、`!isAppRoute(href)` の中の `href` は
  // 「`string` から `Route` を除いた型」に絞られる。`Route` は Next.js が
  // `.next/types` に生成する型で、その中身はローカルのキャッシュ状態と CI の
  // クリーンチェックアウトで一致しない。実際に PR #1662 では、ここが CI でだけ
  // `never` に絞られて `restrict-template-expressions` が落ちた。
  // 絞り込みの影響を受けない別の束縛から読めば、環境差に左右されない。
  const requested: string = href;
  if (!isAppRoute(href)) {
    throw new Error(`Expected an internal application route: ${requested}`);
  }

  return href;
}
