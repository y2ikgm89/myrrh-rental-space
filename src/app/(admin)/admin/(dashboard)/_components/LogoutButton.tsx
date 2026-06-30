/**
 * IAP ログアウトリンク。
 */

import type { ReactElement } from "react";

export function LogoutButton(): ReactElement {
  return (
    // eslint-disable-next-line @next/next/no-html-link-for-pages
    <a
      href="/admin?gcp-iap-mode=CLEAR_LOGIN_COOKIE"
      className="inline-flex min-h-11 items-center px-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      ログアウト
    </a>
  );
}
