import { describe, test, expect } from "bun:test";
import type {
  FilterParams,
  FilterParamsWithCategory,
} from "@/admin/hooks/use-filter-params";

describe("FilterParams type contracts", () => {
  test("デフォルト FilterParams の構造", () => {
    const defaults: FilterParams = {
      search: "",
      status: "ALL",
      page: 1,
      perPage: 10,
    };
    expect(defaults.search).toBe("");
    expect(defaults.status).toBe("ALL");
    expect(defaults.page).toBe(1);
    expect(defaults.perPage).toBe(10);
  });

  test("FilterParamsWithCategory は categoryId を含む", () => {
    const defaults: FilterParamsWithCategory = {
      search: "",
      status: "ALL",
      page: 1,
      perPage: 10,
      categoryId: "ALL",
    };
    expect(defaults.categoryId).toBe("ALL");
  });

  test("status が 'ALL' → null 変換ロジック", () => {
    const status = "ALL";
    const statusValue = status === "ALL" ? null : status || null;
    expect(statusValue).toBeNull();
  });

  test("status が有効値 → そのまま", () => {
    const status: string = "ACTIVE";
    const statusValue = status === "ALL" ? null : status || null;
    expect(statusValue).toBe("ACTIVE");
  });

  test("status が空文字 → null", () => {
    const status: string = "";
    const statusValue = status === "ALL" ? null : status || null;
    expect(statusValue).toBeNull();
  });

  test("search が空文字 → null 変換", () => {
    const search = "";
    const searchValue = search || null;
    expect(searchValue).toBeNull();
  });

  test("search が有効値 → そのまま", () => {
    const search = "テスト";
    const searchValue = search || null;
    expect(searchValue).toBe("テスト");
  });
});
