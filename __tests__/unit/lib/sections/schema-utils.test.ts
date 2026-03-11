import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { extractFieldDefinitions } from "@/shared/lib/sections/schema-utils";

describe("extractFieldDefinitions", () => {
  test("extracts basic string field", () => {
    const schema = z.object({
      title: z.string().default("").meta({ description: "タイトル" }),
    });
    const fields = extractFieldDefinitions(schema);
    expect(fields).toHaveLength(1);
    expect(fields[0].name).toBe("title");
    expect(fields[0].label).toBe("タイトル");
    expect(fields[0].fieldType).toBe("text");
  });

  test("extracts number field with min/max", () => {
    const schema = z.object({
      speed: z.number().min(0).max(1).default(0.3).meta({
        description: "速度",
        fieldType: "slider",
      }),
    });
    const fields = extractFieldDefinitions(schema);
    expect(fields[0].fieldType).toBe("slider");
    expect(fields[0].min).toBe(0);
    expect(fields[0].max).toBe(1);
  });

  test("extracts enum field as select", () => {
    const schema = z.object({
      position: z.enum(["left", "center", "right"]).default("center").meta({
        description: "位置",
      }),
    });
    const fields = extractFieldDefinitions(schema);
    expect(fields[0].fieldType).toBe("select");
    expect(fields[0].enumValues).toEqual(["left", "center", "right"]);
  });

  test("extracts boolean field as switch", () => {
    const schema = z.object({
      enabled: z.boolean().default(true).meta({
        description: "有効",
        fieldType: "switch",
      }),
    });
    const fields = extractFieldDefinitions(schema);
    expect(fields[0].fieldType).toBe("switch");
  });

  test("extracts custom fieldType from meta", () => {
    const schema = z.object({
      image: z.string().default("").meta({
        description: "画像",
        fieldType: "media",
      }),
    });
    const fields = extractFieldDefinitions(schema);
    expect(fields[0].fieldType).toBe("media");
  });

  test("extracts visibleWhen from meta", () => {
    const schema = z.object({
      mode: z.enum(["auto", "manual"]).default("auto").meta({
        description: "モード",
      }),
      manualValue: z
        .string()
        .default("")
        .meta({
          description: "手動値",
          visibleWhen: { field: "mode", value: "manual" },
        }),
    });
    const fields = extractFieldDefinitions(schema);
    expect(fields[1].visibleWhen).toEqual({
      field: "mode",
      value: "manual",
    });
  });

  test("returns empty array for non-object schema", () => {
    const schema = z.string();
    const fields = extractFieldDefinitions(schema);
    expect(fields).toEqual([]);
  });
});
