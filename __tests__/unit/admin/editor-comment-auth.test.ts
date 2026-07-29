import { describe, expect, test } from "bun:test";
import { commentableContentTypeToResource } from "@/admin/lib/editor-comment-auth";

describe("commentableContentTypeToResource", () => {
  test("maps CMS content types to admin RBAC resources", () => {
    expect(commentableContentTypeToResource("post")).toBe("post");
    expect(commentableContentTypeToResource("news")).toBe("news");
    expect(commentableContentTypeToResource("page")).toBe("page");
    expect(commentableContentTypeToResource("faq")).toBe("faq");
  });
});
