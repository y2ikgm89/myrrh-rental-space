/**
 * IAP 補助画面用レイアウト。
 *
 * サイドバーなしで、権限エラーなど最小限の案内だけを表示する。
 */

import type { ReactElement, ReactNode } from "react";

export default function AuthLayout({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return <>{children}</>;
}
