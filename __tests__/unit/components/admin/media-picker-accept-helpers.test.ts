import { describe, test, expect } from "bun:test";
import {
  acceptToInputAttr,
  acceptToInitialMediaType,
  acceptToLabel,
  acceptToUrlPlaceholder,
  urlLooksLikeImage,
  urlMatchesAccept,
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

describe("urlLooksLikeImage", () => {
  test("画像拡張子 URL を true と判定する", () => {
    expect(urlLooksLikeImage("https://example.com/photo.jpg")).toBe(true);
    expect(urlLooksLikeImage("https://example.com/photo.webp")).toBe(true);
  });

  test("非画像拡張子 URL を false と判定する", () => {
    expect(urlLooksLikeImage("https://example.com/video.mp4")).toBe(false);
    expect(urlLooksLikeImage("https://www.youtube.com/watch?v=abc")).toBe(
      false,
    );
  });
});

describe("urlMatchesAccept", () => {
  test("http/https 以外は拒否する", () => {
    expect(urlMatchesAccept("ftp://example.com/photo.jpg", "image")).toBe(
      false,
    );
  });

  test("video accept は YouTube / Vimeo を許容する", () => {
    expect(
      urlMatchesAccept("https://www.youtube.com/watch?v=abc123", "video"),
    ).toBe(true);
    expect(urlMatchesAccept("https://vimeo.com/123456", "video")).toBe(true);
  });

  test("video accept は mp4 拡張子も許容する", () => {
    expect(urlMatchesAccept("https://cdn.example.com/clip.mp4", "video")).toBe(
      true,
    );
  });

  test("image accept は画像拡張子のみ許容する", () => {
    expect(urlMatchesAccept("https://example.com/hero.png", "image")).toBe(
      true,
    );
    expect(
      urlMatchesAccept("https://www.youtube.com/watch?v=abc123", "image"),
    ).toBe(false);
  });

  test("file accept は PDF のみ許容する", () => {
    expect(urlMatchesAccept("https://example.com/doc.pdf", "file")).toBe(true);
    expect(urlMatchesAccept("https://example.com/doc.docx", "file")).toBe(
      false,
    );
  });

  test("image-or-video accept は画像と動画の両方を許容する", () => {
    expect(
      urlMatchesAccept("https://example.com/photo.jpg", "image-or-video"),
    ).toBe(true);
    expect(
      urlMatchesAccept(
        "https://www.youtube.com/watch?v=abc123",
        "image-or-video",
      ),
    ).toBe(true);
  });
});
