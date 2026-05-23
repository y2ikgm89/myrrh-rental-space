import { describe, test, expect } from "bun:test";
import {
  acceptToInputAttr,
  acceptToInitialMediaType,
  acceptToLabel,
  acceptToUrlPlaceholder,
} from "@/admin/components/media-picker/accept-helpers";

describe("acceptToInputAttr", () => {
  test("各 accept で native <input accept> 文字列を返す", () => {
    expect(acceptToInputAttr("image")).toBe("image/*");
    expect(acceptToInputAttr("video")).toBe("video/*");
    expect(acceptToInputAttr("audio")).toBe("audio/*");
    expect(acceptToInputAttr("file")).toBe("application/pdf");
    expect(acceptToInputAttr("any")).toBe(
      "image/*,video/*,audio/*,application/pdf",
    );
  });
});

describe("acceptToInitialMediaType", () => {
  test("MediaType filter に narrow (Phase 4 で AUDIO enum 追加済)", () => {
    expect(acceptToInitialMediaType("image")).toBe("IMAGE");
    expect(acceptToInitialMediaType("video")).toBe("VIDEO");
    expect(acceptToInitialMediaType("audio")).toBe("AUDIO");
    expect(acceptToInitialMediaType("file")).toBe("DOCUMENT");
    expect(acceptToInitialMediaType("any")).toBeUndefined();
  });
});

describe("acceptToLabel", () => {
  test("日本語ラベルを返す", () => {
    expect(acceptToLabel("image")).toBe("画像");
    expect(acceptToLabel("video")).toBe("動画");
    expect(acceptToLabel("audio")).toBe("音声");
    expect(acceptToLabel("file")).toBe("ファイル");
    expect(acceptToLabel("any")).toBe("メディア");
  });
});

describe("acceptToUrlPlaceholder", () => {
  test("video は YouTube/Vimeo embed URL も hint に含む", () => {
    const ph = acceptToUrlPlaceholder("video");
    expect(ph).toContain("youtube.com");
  });

  test("file は PDF 拡張子 hint", () => {
    expect(acceptToUrlPlaceholder("file")).toContain(".pdf");
  });
});
