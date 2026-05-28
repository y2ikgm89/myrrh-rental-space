import { describe, expect, test } from "bun:test";
import {
  filterSidebarGroupsByPermission,
  SIDEBAR_GROUPS,
} from "@/app/(admin)/admin/(dashboard)/_components/sidebar-items";

describe("admin sidebar groups", () => {
  test("5 グループ構成 (概要 / 運営 / カタログ / コンテンツ / システム)", () => {
    const labels = SIDEBAR_GROUPS.map((group) => group.label);
    expect(labels).toEqual([
      "概要",
      "運営",
      "カタログ",
      "コンテンツ",
      "システム",
    ]);
  });

  test("read 権限のない管理メニューを表示対象から外す", () => {
    const visibleGroups = filterSidebarGroupsByPermission(
      SIDEBAR_GROUPS,
      (permission) =>
        permission.resource === "page" ||
        permission.resource === "notification",
    );

    const labels = visibleGroups.flatMap((group) =>
      group.items.map((item) => item.label),
    );

    expect(labels).toContain("ダッシュボード");
    expect(labels).toContain("ページ管理");
    expect(labels).toContain("通知");
    expect(labels).not.toContain("スタッフ管理");
    expect(labels).not.toContain("監査ログ");
    expect(labels).not.toContain("設定");
  });

  test("全アイテムが見えないグループは結果から除外される", () => {
    const visibleGroups = filterSidebarGroupsByPermission(
      SIDEBAR_GROUPS,
      (permission) => permission.resource === "page",
    );

    const groupLabels = visibleGroups.map((group) => group.label);
    // 「運営」「カタログ」「システム」グループは page 権限のみでは項目ゼロになり除外される
    expect(groupLabels).not.toContain("運営");
    expect(groupLabels).not.toContain("カタログ");
    expect(groupLabels).not.toContain("システム");
    // 「概要」はダッシュボード (権限不要) が残るので含まれる
    expect(groupLabels).toContain("概要");
    // 「コンテンツ」はページ管理が残るので含まれる
    expect(groupLabels).toContain("コンテンツ");
  });
});
