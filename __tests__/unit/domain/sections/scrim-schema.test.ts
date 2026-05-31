import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  SCRIM_TONES,
  createScrimFields,
} from "@/shared/lib/sections/definitions/_shared/scrim";

describe("createScrimFields", () => {
  const schema = z.object({ ...createScrimFields() });

  test("空オブジェクトで default が適用される", () => {
    const result = schema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scrimTone).toBe("dark");
      expect(result.data.scrimOpacity).toBe(40);
    }
  });

  test("有効な tone / opacity を受理する", () => {
    const result = schema.safeParse({ scrimTone: "light", scrimOpacity: 0 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scrimTone).toBe("light");
      expect(result.data.scrimOpacity).toBe(0);
    }
  });

  test("不正な tone は reject", () => {
    expect(schema.safeParse({ scrimTone: "rainbow" }).success).toBe(false);
  });

  test("opacity 範囲外は reject", () => {
    expect(schema.safeParse({ scrimOpacity: 150 }).success).toBe(false);
  });

  test("SCRIM_TONES は dark / light の 2 値", () => {
    expect([...SCRIM_TONES]).toEqual(["dark", "light"]);
  });
});
