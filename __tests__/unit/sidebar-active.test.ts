import { describe, expect, test } from "bun:test";
import {
  hrefMatchesCurrentUrl,
  isSidebarItemActive,
} from "@/app/(admin)/admin/(dashboard)/_components/sidebar-active";

const params = (query = "") => new URLSearchParams(query);

describe("hrefMatchesCurrentUrl", () => {
  test("bare path: 完全一致で true", () => {
    expect(
      hrefMatchesCurrentUrl("/admin/pages", "/admin/pages", params()),
    ).toBe(true);
  });

  test("bare path: サブルート一致で true", () => {
    expect(
      hrefMatchesCurrentUrl(
        "/admin/pages",
        "/admin/pages/abc/edit",
        params("tab=seo"),
      ),
    ).toBe(true);
  });

  test("bare path: 別リソースは false", () => {
    expect(
      hrefMatchesCurrentUrl("/admin/pages", "/admin/posts", params()),
    ).toBe(false);
  });

  test("/admin はサブルートの prefix にならない（完全一致のみ）", () => {
    expect(hrefMatchesCurrentUrl("/admin", "/admin/pages", params())).toBe(
      false,
    );
    expect(hrefMatchesCurrentUrl("/admin", "/admin", params())).toBe(true);
  });

  test("query-bearing: クエリ全キー一致で true", () => {
    expect(
      hrefMatchesCurrentUrl(
        "/admin/spaces?tab=reviews",
        "/admin/spaces",
        params("tab=reviews"),
      ),
    ).toBe(true);
  });

  test("query-bearing: クエリ不一致は false", () => {
    expect(
      hrefMatchesCurrentUrl(
        "/admin/spaces?tab=reviews",
        "/admin/spaces",
        params("tab=locations"),
      ),
    ).toBe(false);
    expect(
      hrefMatchesCurrentUrl(
        "/admin/spaces?tab=reviews",
        "/admin/spaces",
        params(),
      ),
    ).toBe(false);
  });
});

describe("isSidebarItemActive", () => {
  test("編集フォーム内部タブ (?tab=seo) でも親項目は active のまま（回帰防止）", () => {
    // /admin/pages/[slug]/edit?tab=seo を開いても「ページ管理」は active
    // query-bearing な兄弟項目が存在しないケース
    expect(
      isSidebarItemActive(
        "/admin/pages",
        "/admin/pages/my-page/edit",
        params("tab=seo"),
        [],
      ),
    ).toBe(true);
  });

  test("一覧ハブのタブ (?tab=locations) でも親項目は active のまま", () => {
    expect(
      isSidebarItemActive(
        "/admin/spaces",
        "/admin/spaces",
        params("tab=locations"),
        [],
      ),
    ).toBe(true);
  });

  test("query-bearing な兄弟が一致するときだけ bare 項目はハイライトを譲る", () => {
    const queryBearing = ["/admin/spaces?tab=reviews"];
    // 現在 URL が兄弟と一致 → bare の「スペース管理」は非アクティブ
    expect(
      isSidebarItemActive(
        "/admin/spaces",
        "/admin/spaces",
        params("tab=reviews"),
        queryBearing,
      ),
    ).toBe(false);
    // 兄弟側はアクティブ
    expect(
      isSidebarItemActive(
        "/admin/spaces?tab=reviews",
        "/admin/spaces",
        params("tab=reviews"),
        queryBearing,
      ),
    ).toBe(true);
  });

  test("query-bearing 兄弟が居ても別タブなら bare 項目は active", () => {
    const queryBearing = ["/admin/spaces?tab=reviews"];
    expect(
      isSidebarItemActive(
        "/admin/spaces",
        "/admin/spaces",
        params("tab=locations"),
        queryBearing,
      ),
    ).toBe(true);
  });

  test("完全一致 + クエリなしで active", () => {
    expect(
      isSidebarItemActive("/admin/pages", "/admin/pages", params(), []),
    ).toBe(true);
  });

  test("パス不一致は false", () => {
    expect(
      isSidebarItemActive("/admin/pages", "/admin/posts", params(), []),
    ).toBe(false);
  });
});
