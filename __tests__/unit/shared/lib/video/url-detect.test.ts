import { describe, expect, it } from "bun:test";

import {
  detectVideoProvider,
  isEmbeddableVideoUrl,
} from "@/shared/lib/video/url-detect";

describe("detectVideoProvider", () => {
  describe("YouTube", () => {
    it("detects youtube.com/watch?v= URL", () => {
      const result = detectVideoProvider(
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      );
      expect(result.provider).toBe("youtube");
      expect(result.source).toBe("external");
      expect(result.videoId).toBe("dQw4w9WgXcQ");
      expect(result.embedUrl).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    });

    it("detects youtu.be short URL", () => {
      const result = detectVideoProvider("https://youtu.be/dQw4w9WgXcQ");
      expect(result.provider).toBe("youtube");
      expect(result.videoId).toBe("dQw4w9WgXcQ");
      expect(result.embedUrl).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    });

    it("detects youtube.com/embed/ URL", () => {
      const result = detectVideoProvider(
        "https://www.youtube.com/embed/dQw4w9WgXcQ",
      );
      expect(result.provider).toBe("youtube");
      expect(result.videoId).toBe("dQw4w9WgXcQ");
    });

    it("detects youtube.com/shorts/ URL", () => {
      const result = detectVideoProvider(
        "https://www.youtube.com/shorts/abc123XYZ",
      );
      expect(result.provider).toBe("youtube");
      expect(result.videoId).toBe("abc123XYZ");
    });
  });

  describe("Vimeo", () => {
    it("detects vimeo.com/<id> URL", () => {
      const result = detectVideoProvider("https://vimeo.com/123456789");
      expect(result.provider).toBe("vimeo");
      expect(result.source).toBe("external");
      expect(result.videoId).toBe("123456789");
      expect(result.embedUrl).toBe("https://player.vimeo.com/video/123456789");
    });

    it("detects player.vimeo.com/video/<id> URL", () => {
      const result = detectVideoProvider(
        "https://player.vimeo.com/video/987654321",
      );
      expect(result.provider).toBe("vimeo");
      expect(result.videoId).toBe("987654321");
    });
  });

  describe("R2 (self-host)", () => {
    it("detects R2 URL by publicUrl prefix", () => {
      const result = detectVideoProvider(
        "https://media.example.com/spaces/hero.mp4",
        "https://media.example.com",
      );
      expect(result.source).toBe("r2");
      expect(result.provider).toBeUndefined();
    });

    it("returns external when R2 prefix not provided", () => {
      const result = detectVideoProvider(
        "https://media.example.com/spaces/hero.mp4",
      );
      expect(result.source).toBe("external");
      expect(result.provider).toBeUndefined();
    });

    it("returns external when URL does not match R2 prefix", () => {
      const result = detectVideoProvider(
        "https://cdn.other.com/video.mp4",
        "https://media.example.com",
      );
      expect(result.source).toBe("external");
    });
  });

  describe("Edge cases", () => {
    it("returns external for empty string", () => {
      const result = detectVideoProvider("");
      expect(result.source).toBe("external");
      expect(result.provider).toBeUndefined();
    });

    it("returns external for arbitrary mp4 URL", () => {
      const result = detectVideoProvider("https://example.com/video.mp4");
      expect(result.source).toBe("external");
      expect(result.provider).toBeUndefined();
    });

    it("handles YouTube URL with extra query params", () => {
      const result = detectVideoProvider(
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLABC&index=1",
      );
      expect(result.provider).toBe("youtube");
      expect(result.videoId).toBe("dQw4w9WgXcQ");
    });

    it("YouTube provider takes precedence over R2 prefix", () => {
      // 理論上は起こらないが、provider 判定が先に走ることを契約として保証
      const result = detectVideoProvider(
        "https://youtu.be/abc123",
        "https://youtu.be",
      );
      expect(result.provider).toBe("youtube");
      expect(result.source).toBe("external");
    });
  });
});

describe("isEmbeddableVideoUrl", () => {
  it("returns true for YouTube URL", () => {
    expect(isEmbeddableVideoUrl("https://youtu.be/abc123")).toBe(true);
  });

  it("returns true for Vimeo URL", () => {
    expect(isEmbeddableVideoUrl("https://vimeo.com/123456")).toBe(true);
  });

  it("returns false for direct mp4 URL", () => {
    expect(isEmbeddableVideoUrl("https://example.com/video.mp4")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isEmbeddableVideoUrl("")).toBe(false);
  });
});
