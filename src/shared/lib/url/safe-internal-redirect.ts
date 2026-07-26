/**
 * 同一オリジン内の相対 path redirect 用 SSoT（open redirect 対策）。
 *
 * OWASP 推奨に沿い `new URL(path, origin)` で parse し same-origin を要求する。
 * 生の path は `/` 1 文字始まり、`//` / `\` / `://` / 制御文字 / 空白 / `..` を拒否する。
 */
const INTERNAL_REDIRECT_ORIGIN = "https://redirect-validator.local";

function hasDisallowedRawCharacters(path: string): boolean {
  if (/[\u0000-\u001F\u007F]/.test(path)) return true;
  if (path.includes("\\")) return true;
  if (path.includes("://")) return true;
  return false;
}

function hasUnsafePathSegments(path: string): boolean {
  const candidates = [path];
  try {
    candidates.push(decodeURIComponent(path));
  } catch {
    return true;
  }

  return candidates.some((candidate) => {
    if (candidate.startsWith("//")) return true;
    if (candidate.includes("\\")) return true;
    return candidate.split("/").some((segment) => segment === "..");
  });
}

export function isSafeInternalRedirectPath(path: string): boolean {
  if (!path || path.trim() !== path) return false;
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (hasDisallowedRawCharacters(path)) return false;
  if (hasUnsafePathSegments(path)) return false;

  try {
    const parsed = new URL(path, INTERNAL_REDIRECT_ORIGIN);
    if (parsed.origin !== INTERNAL_REDIRECT_ORIGIN) return false;
    if (!parsed.pathname.startsWith("/")) return false;
  } catch {
    return false;
  }

  return true;
}

export function isSafeInternalRedirect(
  path: string | null | undefined,
): path is string {
  return typeof path === "string" && isSafeInternalRedirectPath(path);
}
