import { describe, expect, test } from "bun:test";
import {
  findMatches,
  replaceAll,
} from "@/admin/components/editor/lexical/plugins/find-replace-text";

describe("find-replace-text", () => {
  test("replaceAll does not over-replace overlapping search text", () => {
    expect(replaceAll("ーーーー", "ーー", "—")).toBe("——");
  });

  test("findMatches counts non-overlapping matches only", () => {
    expect(findMatches("ーーーー", "ーー")).toHaveLength(2);
  });

  test("replaceAll still replaces non-overlapping matches", () => {
    expect(replaceAll("hello world", "o", "O")).toBe("hellO wOrld");
  });
});
