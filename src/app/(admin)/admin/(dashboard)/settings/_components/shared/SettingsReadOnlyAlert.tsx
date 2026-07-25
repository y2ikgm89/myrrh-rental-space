import type { ReactElement } from "react";
import { IconEye } from "@tabler/icons-react";
import { Alert, AlertDescription, AlertTitle } from "@/admin/components/ui";

/** VIEWER 等、更新権限がないユーザー向けの閲覧専用案内。 */
export function SettingsReadOnlyAlert(): ReactElement {
  return (
    <Alert variant="info">
      <IconEye aria-hidden="true" />
      <AlertTitle>閲覧専用</AlertTitle>
      <AlertDescription>
        現在のロールでは設定の変更はできません。内容の確認のみ可能です。
      </AlertDescription>
    </Alert>
  );
}
