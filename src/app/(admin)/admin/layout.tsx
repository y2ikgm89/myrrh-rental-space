/**
 * 管理画面共通レイアウト
 *
 * Toasterなど管理画面全体で必要なコンポーネントを配置
 * html/body は親の Root Layout で定義済み
 */

import { Toaster } from "@/admin/components/ui";
import type { ReactElement, ReactNode } from "react";

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
