import { describe, test, expect } from "bun:test";
import {
  sortOrderSchema,
  spaceSearchParamsSchema,
  spaceSearchParamsDefaults,
  blogSearchParamsSchema,
  blogSearchParamsDefaults,
} from "@/shared/lib/validations/search-params";

// ============================================================
// sortOrderSchema
// ============================================================

describe("sortOrderSchema", () => {
  describe("正常系", () => {
    test("'asc' を受け付ける", () => {
      const result = sortOrderSchema.safeParse("asc");
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBe("asc");
    });

    test("'desc' を受け付ける", () => {
      const result = sortOrderSchema.safeParse("desc");
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBe("desc");
    });
  });

  describe("異常系", () => {
    test("無効な文字列で失敗する", () => {
      const result = sortOrderSchema.safeParse("invalid");
      expect(result.success).toBe(false);
    });

    test("大文字 'ASC' で失敗する（大文字小文字区別あり）", () => {
      const result = sortOrderSchema.safeParse("ASC");
      expect(result.success).toBe(false);
    });

    test("大文字 'DESC' で失敗する（大文字小文字区別あり）", () => {
      const result = sortOrderSchema.safeParse("DESC");
      expect(result.success).toBe(false);
    });

    test("空文字列で失敗する", () => {
      const result = sortOrderSchema.safeParse("");
      expect(result.success).toBe(false);
    });

    test("null で失敗する", () => {
      const result = sortOrderSchema.safeParse(null);
      expect(result.success).toBe(false);
    });

    test("undefined で失敗する", () => {
      const result = sortOrderSchema.safeParse(undefined);
      expect(result.success).toBe(false);
    });

    test("数値で失敗する", () => {
      const result = sortOrderSchema.safeParse(1);
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================
// spaceSearchParamsSchema
// ============================================================

const VALID_SPACE_PARAMS = {
  q: "テストスペース",
  page: 1,
  perPage: 10,
  sort: "desc",
} as const;

describe("spaceSearchParamsSchema", () => {
  describe("正常系", () => {
    test("有効な最小データで通過する", () => {
      const result = spaceSearchParamsSchema.safeParse(VALID_SPACE_PARAMS);
      expect(result.success).toBe(true);
    });

    test("空の検索クエリで通過する", () => {
      const result = spaceSearchParamsSchema.safeParse({
        ...VALID_SPACE_PARAMS,
        q: "",
      });
      expect(result.success).toBe(true);
    });

    test("sort が 'asc' でも通過する", () => {
      const result = spaceSearchParamsSchema.safeParse({
        ...VALID_SPACE_PARAMS,
        sort: "asc",
      });
      expect(result.success).toBe(true);
    });

    test("page が大きい値でも通過する", () => {
      const result = spaceSearchParamsSchema.safeParse({
        ...VALID_SPACE_PARAMS,
        page: 999,
      });
      expect(result.success).toBe(true);
    });

    test("perPage が大きい値でも通過する", () => {
      const result = spaceSearchParamsSchema.safeParse({
        ...VALID_SPACE_PARAMS,
        perPage: 100,
      });
      expect(result.success).toBe(true);
    });

    test("パース後のデータが正しい型を持つ", () => {
      const result = spaceSearchParamsSchema.safeParse(VALID_SPACE_PARAMS);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.data.q).toBe("string");
        expect(typeof result.data.page).toBe("number");
        expect(typeof result.data.perPage).toBe("number");
        expect(result.data.sort === "asc" || result.data.sort === "desc").toBe(
          true,
        );
      }
    });
  });

  describe("異常系", () => {
    test("page が 0 以下で失敗する", () => {
      const result = spaceSearchParamsSchema.safeParse({
        ...VALID_SPACE_PARAMS,
        page: 0,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes("page"))).toBe(
          true,
        );
      }
    });

    test("page が負数で失敗する", () => {
      const result = spaceSearchParamsSchema.safeParse({
        ...VALID_SPACE_PARAMS,
        page: -1,
      });
      expect(result.success).toBe(false);
    });

    test("page が小数で失敗する", () => {
      const result = spaceSearchParamsSchema.safeParse({
        ...VALID_SPACE_PARAMS,
        page: 1.5,
      });
      expect(result.success).toBe(false);
    });

    test("perPage が 0 以下で失敗する", () => {
      const result = spaceSearchParamsSchema.safeParse({
        ...VALID_SPACE_PARAMS,
        perPage: 0,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some((i) => i.path.includes("perPage")),
        ).toBe(true);
      }
    });

    test("perPage が小数で失敗する", () => {
      const result = spaceSearchParamsSchema.safeParse({
        ...VALID_SPACE_PARAMS,
        perPage: 10.5,
      });
      expect(result.success).toBe(false);
    });

    test("sort が無効な値で失敗する", () => {
      const result = spaceSearchParamsSchema.safeParse({
        ...VALID_SPACE_PARAMS,
        sort: "invalid",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes("sort"))).toBe(
          true,
        );
      }
    });

    test("q が欠落で失敗する", () => {
      const { q: _q, ...rest } = VALID_SPACE_PARAMS;
      const result = spaceSearchParamsSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    test("page が欠落で失敗する", () => {
      const { page: _page, ...rest } = VALID_SPACE_PARAMS;
      const result = spaceSearchParamsSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    test("perPage が欠落で失敗する", () => {
      const { perPage: _perPage, ...rest } = VALID_SPACE_PARAMS;
      const result = spaceSearchParamsSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    test("sort が欠落で失敗する", () => {
      const { sort: _sort, ...rest } = VALID_SPACE_PARAMS;
      const result = spaceSearchParamsSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    test("空オブジェクトで失敗する", () => {
      const result = spaceSearchParamsSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================
// spaceSearchParamsDefaults
// ============================================================

describe("spaceSearchParamsDefaults", () => {
  test("デフォルトの q が空文字列", () => {
    expect(spaceSearchParamsDefaults.q).toBe("");
  });

  test("デフォルトの page が 1", () => {
    expect(spaceSearchParamsDefaults.page).toBe(1);
  });

  test("デフォルトの perPage が 10", () => {
    expect(spaceSearchParamsDefaults.perPage).toBe(10);
  });

  test("デフォルトの sort が 'desc'", () => {
    expect(spaceSearchParamsDefaults.sort).toBe("desc");
  });

  test("デフォルト値がスキーマを通過する", () => {
    const result = spaceSearchParamsSchema.safeParse(spaceSearchParamsDefaults);
    expect(result.success).toBe(true);
  });
});

// ============================================================
// blogSearchParamsSchema
// ============================================================

const VALID_BLOG_PARAMS = {
  q: "Next.js",
  page: 1,
  perPage: 10,
  category: "tech",
  tags: ["react", "typescript"],
  sort: "desc",
} as const;

describe("blogSearchParamsSchema", () => {
  describe("正常系", () => {
    test("有効な最小データで通過する", () => {
      const result = blogSearchParamsSchema.safeParse(VALID_BLOG_PARAMS);
      expect(result.success).toBe(true);
    });

    test("空の検索クエリで通過する", () => {
      const result = blogSearchParamsSchema.safeParse({
        ...VALID_BLOG_PARAMS,
        q: "",
      });
      expect(result.success).toBe(true);
    });

    test("空の category で通過する", () => {
      const result = blogSearchParamsSchema.safeParse({
        ...VALID_BLOG_PARAMS,
        category: "",
      });
      expect(result.success).toBe(true);
    });

    test("空の tags 配列で通過する", () => {
      const result = blogSearchParamsSchema.safeParse({
        ...VALID_BLOG_PARAMS,
        tags: [],
      });
      expect(result.success).toBe(true);
    });

    test("tags が単一要素の配列で通過する", () => {
      const result = blogSearchParamsSchema.safeParse({
        ...VALID_BLOG_PARAMS,
        tags: ["react"],
      });
      expect(result.success).toBe(true);
    });

    test("sort が 'asc' でも通過する", () => {
      const result = blogSearchParamsSchema.safeParse({
        ...VALID_BLOG_PARAMS,
        sort: "asc",
      });
      expect(result.success).toBe(true);
    });

    test("パース後のデータが正しい型を持つ", () => {
      const result = blogSearchParamsSchema.safeParse(VALID_BLOG_PARAMS);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.data.q).toBe("string");
        expect(typeof result.data.page).toBe("number");
        expect(typeof result.data.perPage).toBe("number");
        expect(typeof result.data.category).toBe("string");
        expect(Array.isArray(result.data.tags)).toBe(true);
        expect(result.data.sort === "asc" || result.data.sort === "desc").toBe(
          true,
        );
      }
    });
  });

  describe("異常系", () => {
    test("page が 0 以下で失敗する", () => {
      const result = blogSearchParamsSchema.safeParse({
        ...VALID_BLOG_PARAMS,
        page: 0,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes("page"))).toBe(
          true,
        );
      }
    });

    test("page が負数で失敗する", () => {
      const result = blogSearchParamsSchema.safeParse({
        ...VALID_BLOG_PARAMS,
        page: -5,
      });
      expect(result.success).toBe(false);
    });

    test("page が小数で失敗する", () => {
      const result = blogSearchParamsSchema.safeParse({
        ...VALID_BLOG_PARAMS,
        page: 2.5,
      });
      expect(result.success).toBe(false);
    });

    test("perPage が 0 以下で失敗する", () => {
      const result = blogSearchParamsSchema.safeParse({
        ...VALID_BLOG_PARAMS,
        perPage: 0,
      });
      expect(result.success).toBe(false);
    });

    test("sort が無効な値で失敗する", () => {
      const result = blogSearchParamsSchema.safeParse({
        ...VALID_BLOG_PARAMS,
        sort: "newest",
      });
      expect(result.success).toBe(false);
    });

    test("tags が文字列配列でない場合（数値配列）で失敗する", () => {
      const result = blogSearchParamsSchema.safeParse({
        ...VALID_BLOG_PARAMS,
        tags: [1, 2, 3],
      });
      expect(result.success).toBe(false);
    });

    test("tags が文字列で失敗する（配列でなければならない）", () => {
      const result = blogSearchParamsSchema.safeParse({
        ...VALID_BLOG_PARAMS,
        tags: "react,typescript",
      });
      expect(result.success).toBe(false);
    });

    test("category が欠落で失敗する", () => {
      const { category: _category, ...rest } = VALID_BLOG_PARAMS;
      const result = blogSearchParamsSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    test("tags が欠落で失敗する", () => {
      const { tags: _tags, ...rest } = VALID_BLOG_PARAMS;
      const result = blogSearchParamsSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    test("空オブジェクトで失敗する", () => {
      const result = blogSearchParamsSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================
// blogSearchParamsDefaults
// ============================================================

describe("blogSearchParamsDefaults", () => {
  test("デフォルトの q が空文字列", () => {
    expect(blogSearchParamsDefaults.q).toBe("");
  });

  test("デフォルトの page が 1", () => {
    expect(blogSearchParamsDefaults.page).toBe(1);
  });

  test("デフォルトの perPage が 10", () => {
    expect(blogSearchParamsDefaults.perPage).toBe(10);
  });

  test("デフォルトの category が空文字列", () => {
    expect(blogSearchParamsDefaults.category).toBe("");
  });

  test("デフォルトの tags が空配列", () => {
    expect(blogSearchParamsDefaults.tags).toEqual([]);
  });

  test("デフォルトの sort が 'desc'", () => {
    expect(blogSearchParamsDefaults.sort).toBe("desc");
  });

  test("デフォルト値がスキーマを通過する", () => {
    const result = blogSearchParamsSchema.safeParse(blogSearchParamsDefaults);
    expect(result.success).toBe(true);
  });
});
