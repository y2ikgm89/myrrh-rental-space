"use client";

export function CopyrightYear() {
  // 現在年は client 固有値（new Date()）。年境界（大晦日↔元日）を timezone 差で跨ぐと
  // SSR（サーバ時刻）と hydration（クライアント時刻）で年がズレ #418/#425 になり得る。
  // cacheComponents 下ではサーバ側の現在時刻読み取りに制約があるため client のまま、
  // 単一テキストノードの不可避な時刻差は React 公式エスケープハッチ
  // suppressHydrationWarning で抑止する（1 要素 1 階層のみ）。SSR でも年は出力されるため
  // no-JS / SEO でも欠落しない。
  // eslint-disable-next-line @eslint-react/purity -- Client Component: new Date() is intentional
  return <span suppressHydrationWarning>{new Date().getFullYear()}</span>;
}
