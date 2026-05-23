import { describe, test, expect } from "bun:test";
import { field, fieldRegistry } from "@/shared/lib/sections/field-registry";
import { MEDIA_ACCEPT_TYPES } from "@/shared/lib/sections/types";

describe("field.media", () => {
  test("各 accept カテゴリで fieldType=media + mediaAccept がメタに登録される", () => {
    for (const accept of MEDIA_ACCEPT_TYPES) {
      const schema = field.media("テスト", { accept });
      const meta = fieldRegistry.get(schema);
      expect(meta).toBeDefined();
      if (!meta) continue;
      expect(meta.fieldType).toBe("media");
      expect(meta.mediaAccept).toBe(accept);
      expect(meta.label).toBe("テスト");
      expect(meta.group).toBe("content");
    }
  });

  test("safeParse({}) が空文字列にフォールバックする (field defaults 契約)", () => {
    const schema = field.media("動画", { accept: "video" });
    const result = schema.safeParse(undefined);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("");
    }
  });

  test("default オプションが反映される", () => {
    const schema = field.media("音声", {
      accept: "audio",
      default: "https://example.com/audio.mp3",
    });
    const result = schema.safeParse(undefined);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("https://example.com/audio.mp3");
    }
  });

  test("helpText / subGroup などのオプションがメタに反映される", () => {
    const schema = field.media("ファイル", {
      accept: "file",
      helpText: "PDF をアップロード",
      subGroup: "media",
    });
    const meta = fieldRegistry.get(schema);
    expect(meta?.helpText).toBe("PDF をアップロード");
    expect(meta?.subGroup).toBe("media");
  });

  test("string 以外を渡すと type 違反として reject", () => {
    const schema = field.media("画像", { accept: "image" });
    expect(schema.safeParse(123).success).toBe(false);
    expect(schema.safeParse({ url: "x" }).success).toBe(false);
  });
});
