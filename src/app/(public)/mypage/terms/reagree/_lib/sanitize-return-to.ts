/**
 * `/mypage/terms/reagree?returnTo=<path>` の open redirect 対策 SSoT。
 *
 * MypageAuthGate は現在の pathname を `returnTo` として引き回すが、submit form の
 * hidden input を差し替えれば任意の値が Server Action に届く。以下を許可条件とする:
 *   - 存在する
 *   - `/mypage` で始まる相対パス
 *   - protocol-relative (`//...`) ではない
 *   - reagree 本体 (`/mypage/terms/reagree`) ではない (循環 redirect 防止)
 *
 * いずれかを満たさない場合は `/mypage` にフォールバックする。
 */
export function sanitizeReturnTo(returnTo: string | null | undefined): string {
  if (!returnTo) return "/mypage";
  if (returnTo.startsWith("//")) return "/mypage";
  if (!returnTo.startsWith("/mypage")) return "/mypage";
  if (returnTo.startsWith("/mypage/terms/reagree")) return "/mypage";
  return returnTo;
}
