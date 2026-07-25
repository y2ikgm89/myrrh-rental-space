/**
 * `/mypage/terms/reagree?returnTo=<path>` の open redirect 対策 SSoT。
 *
 * MypageAuthGate は現在の pathname を `returnTo` として引き回すが、submit form の
 * hidden input を差し替えれば任意の値が Server Action に届く。以下を許可条件とする:
 *   - 存在する
 *   - `/mypage` で始まる相対パス
 *   - protocol-relative (`//...`) ではない
 *   - reagree 本体 (`/mypage/terms/reagree`) ではない (循環 redirect 防止)
 *   - `..` セグメントを含まない (path traversal 対策。URL decode 後も検査)
 *
 * いずれかを満たさない場合は `/mypage` にフォールバックする。
 *
 * URL の `?returnTo=` は重複指定 (`?returnTo=a&returnTo=b`) されると Next.js の
 * searchParams 上で配列になる。呼び出し側の型注釈だけでは実行時にこの形状を
 * 防げないため、SSoT である本関数自身が `string[]` を安全側（フォールバック）に倒す。
 */
function containsParentDirectorySegment(path: string): boolean {
  const candidates = [path];
  try {
    candidates.push(decodeURIComponent(path));
  } catch {
    return true;
  }

  return candidates.some((candidate) =>
    candidate.split("/").some((segment) => segment === ".."),
  );
}

export function sanitizeReturnTo(
  returnTo: string | readonly string[] | null | undefined,
): string {
  if (typeof returnTo !== "string" || !returnTo) return "/mypage";
  if (returnTo.startsWith("//")) return "/mypage";
  if (!returnTo.startsWith("/mypage")) return "/mypage";
  if (containsParentDirectorySegment(returnTo)) return "/mypage";
  if (returnTo.startsWith("/mypage/terms/reagree")) return "/mypage";
  return returnTo;
}
