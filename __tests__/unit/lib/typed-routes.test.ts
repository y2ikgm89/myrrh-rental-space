import { describe, expect, test } from "bun:test";
import { isAppRoute, toAppRoute } from "@/shared/lib/typed-routes";

describe("typed-routes", () => {
  test("内部 application route のみ許可する", () => {
    expect(isAppRoute("/spaces")).toBe(true);
    expect(isAppRoute("/spaces?page=2")).toBe(true);
    expect(isAppRoute("https://example.com/spaces")).toBe(false);
    expect(isAppRoute("//example.com/spaces")).toBe(false);
  });

  test("外部 URL を Route に変換しない", () => {
    expect(() => toAppRoute("https://example.com/spaces")).toThrow(
      "Expected an internal application route",
    );
  });
});
