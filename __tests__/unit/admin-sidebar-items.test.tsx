import { describe, expect, test } from "bun:test";
import {
  filterSidebarItemsByPermission,
  SIDEBAR_ITEMS,
} from "@/app/(admin)/admin/(dashboard)/_components/sidebar-items";

describe("admin sidebar items", () => {
  test("read 権限のない管理メニューを表示対象から外す", () => {
    const visibleItems = filterSidebarItemsByPermission(
      SIDEBAR_ITEMS,
      (permission) =>
        permission.resource === "page" ||
        permission.resource === "notification",
    );

    const labels = visibleItems.map((item) => item.label);

    expect(labels).toContain("ダッシュボード");
    expect(labels).toContain("ページ管理");
    expect(labels).toContain("通知");
    expect(labels).not.toContain("スタッフ管理");
    expect(labels).not.toContain("監査ログ");
    expect(labels).not.toContain("設定");
  });
});
