import { IconBell } from "@tabler/icons-react";
import { getAdminBrandingSettings } from "@/shared/domain/settings/queries/organization";
import { getRecentNotifications } from "@/admin/queries/notification";
import { NotificationBell } from "./NotificationBell";
import { TopBarBranding } from "./TopBarBranding";
import type { ReactElement } from "react";

export function TopBarBrandingFallback(): ReactElement {
  return (
    <span className="text-lg font-semibold text-foreground">管理画面</span>
  );
}

export async function TopBarBrandingSlot(): Promise<ReactElement> {
  const settings = await getAdminBrandingSettings();
  return (
    <TopBarBranding
      siteName={settings.siteName}
      headerLogoUrl={settings.headerLogoUrl}
      useHeaderLogo={settings.useHeaderLogo}
    />
  );
}

export function NotificationBellFallback(): ReactElement {
  return (
    <button
      type="button"
      className="relative rounded-md p-2 text-muted-foreground"
      aria-label="通知を読み込み中"
      disabled
    >
      <IconBell className="h-5 w-5" />
    </button>
  );
}

export async function NotificationBellSlot(): Promise<ReactElement> {
  const recentNotifications = await getRecentNotifications();
  return (
    <NotificationBell
      recentNotifications={recentNotifications.map((notification) => ({
        ...notification,
        createdAt: notification.createdAt.toISOString(),
      }))}
    />
  );
}
