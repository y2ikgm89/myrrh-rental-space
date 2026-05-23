import { describe, test, expect } from "bun:test";
import {
  detectMediaMimeFromMagicBytes,
  MEDIA_MAX_SIZE_BYTES,
  MEDIA_MIME_EXTENSIONS,
  SUPPORTED_MEDIA_MIME_TYPES,
  SUPPORTED_IMAGE_MIME_TYPES,
  SUPPORTED_VIDEO_MIME_TYPES,
  SUPPORTED_AUDIO_MIME_TYPES,
  SUPPORTED_DOCUMENT_MIME_TYPES,
} from "@/shared/lib/r2/media-magic-bytes";

function buf(bytes: number[]): Uint8Array {
  const padded = new Uint8Array(Math.max(bytes.length, 16));
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte !== undefined) padded[i] = byte;
  }
  return padded;
}

describe("SUPPORTED_MEDIA_MIME_TYPES", () => {
  test("4 系統 (image / video / audio / document) を含む", () => {
    const all = SUPPORTED_MEDIA_MIME_TYPES;
    expect(all).toContain("image/jpeg");
    expect(all).toContain("video/mp4");
    expect(all).toContain("audio/mpeg");
    expect(all).toContain("application/pdf");
  });

  test("カテゴリ別の export も整合する", () => {
    const ALL_CATEGORIES = [
      ...SUPPORTED_IMAGE_MIME_TYPES,
      ...SUPPORTED_VIDEO_MIME_TYPES,
      ...SUPPORTED_AUDIO_MIME_TYPES,
      ...SUPPORTED_DOCUMENT_MIME_TYPES,
    ];
    expect(ALL_CATEGORIES).toEqual([...SUPPORTED_MEDIA_MIME_TYPES]);
  });
});

describe("MEDIA_MIME_EXTENSIONS", () => {
  test("全 supported MIME に拡張子マップが存在する", () => {
    for (const mime of SUPPORTED_MEDIA_MIME_TYPES) {
      expect(MEDIA_MIME_EXTENSIONS[mime]).toBeTruthy();
    }
  });

  test("音声 / 動画 / 文書も canonical 拡張子で派生する", () => {
    expect(MEDIA_MIME_EXTENSIONS["video/mp4"]).toBe("mp4");
    expect(MEDIA_MIME_EXTENSIONS["video/webm"]).toBe("webm");
    expect(MEDIA_MIME_EXTENSIONS["audio/mpeg"]).toBe("mp3");
    expect(MEDIA_MIME_EXTENSIONS["audio/wav"]).toBe("wav");
    expect(MEDIA_MIME_EXTENSIONS["application/pdf"]).toBe("pdf");
  });
});

describe("MEDIA_MAX_SIZE_BYTES", () => {
  test("画像 5MB / 動画 50MB / 音声 20MB / 文書 10MB", () => {
    expect(MEDIA_MAX_SIZE_BYTES["image/jpeg"]).toBe(5 * 1024 * 1024);
    expect(MEDIA_MAX_SIZE_BYTES["video/mp4"]).toBe(50 * 1024 * 1024);
    expect(MEDIA_MAX_SIZE_BYTES["audio/mpeg"]).toBe(20 * 1024 * 1024);
    expect(MEDIA_MAX_SIZE_BYTES["application/pdf"]).toBe(10 * 1024 * 1024);
  });

  test("画像 4 種すべて同一上限", () => {
    expect(MEDIA_MAX_SIZE_BYTES["image/png"]).toBe(
      MEDIA_MAX_SIZE_BYTES["image/jpeg"],
    );
    expect(MEDIA_MAX_SIZE_BYTES["image/webp"]).toBe(
      MEDIA_MAX_SIZE_BYTES["image/jpeg"],
    );
    expect(MEDIA_MAX_SIZE_BYTES["image/gif"]).toBe(
      MEDIA_MAX_SIZE_BYTES["image/jpeg"],
    );
  });
});

describe("detectMediaMimeFromMagicBytes — 画像", () => {
  test("JPEG signature を検出", () => {
    expect(detectMediaMimeFromMagicBytes(buf([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      "image/jpeg",
    );
  });

  test("PNG signature を検出", () => {
    expect(
      detectMediaMimeFromMagicBytes(
        buf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe("image/png");
  });

  test("WebP signature を検出 (RIFF...WEBP)", () => {
    expect(
      detectMediaMimeFromMagicBytes(
        buf([
          0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42,
          0x50,
        ]),
      ),
    ).toBe("image/webp");
  });

  test("GIF signature を検出 (GIF87a / GIF89a)", () => {
    expect(
      detectMediaMimeFromMagicBytes(buf([0x47, 0x49, 0x46, 0x38, 0x37, 0x61])),
    ).toBe("image/gif");
    expect(
      detectMediaMimeFromMagicBytes(buf([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])),
    ).toBe("image/gif");
  });
});

describe("detectMediaMimeFromMagicBytes — 動画", () => {
  test("MP4 ftyp box を検出", () => {
    // 0-3: any size, 4-7: "ftyp"
    expect(
      detectMediaMimeFromMagicBytes(
        buf([
          0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f,
          0x6d,
        ]),
      ),
    ).toBe("video/mp4");
  });

  test("WebM EBML header を検出", () => {
    expect(detectMediaMimeFromMagicBytes(buf([0x1a, 0x45, 0xdf, 0xa3]))).toBe(
      "video/webm",
    );
  });
});

describe("detectMediaMimeFromMagicBytes — 音声", () => {
  test("WAV signature を検出 (RIFF...WAVE)", () => {
    expect(
      detectMediaMimeFromMagicBytes(
        buf([
          0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56,
          0x45,
        ]),
      ),
    ).toBe("audio/wav");
  });

  test("MP3 ID3 tag を検出", () => {
    expect(detectMediaMimeFromMagicBytes(buf([0x49, 0x44, 0x33]))).toBe(
      "audio/mpeg",
    );
  });

  test("MP3 frame sync を検出 (0xFFEx / 0xFFFx)", () => {
    expect(detectMediaMimeFromMagicBytes(buf([0xff, 0xfb]))).toBe("audio/mpeg");
    expect(detectMediaMimeFromMagicBytes(buf([0xff, 0xe0]))).toBe("audio/mpeg");
  });
});

describe("detectMediaMimeFromMagicBytes — 文書", () => {
  test("PDF signature を検出", () => {
    expect(
      detectMediaMimeFromMagicBytes(
        buf([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]),
      ),
    ).toBe("application/pdf");
  });
});

describe("detectMediaMimeFromMagicBytes — 拒否ケース", () => {
  test("12 byte 未満は null", () => {
    expect(detectMediaMimeFromMagicBytes(new Uint8Array([0xff, 0xd8]))).toBe(
      null,
    );
  });

  test("非対応形式 (HTML / ZIP / SVG) は null", () => {
    // HTML: "<!DOCTYPE"
    expect(
      detectMediaMimeFromMagicBytes(
        buf([0x3c, 0x21, 0x44, 0x4f, 0x43, 0x54, 0x59, 0x50, 0x45]),
      ),
    ).toBe(null);
    // ZIP: PK..
    expect(detectMediaMimeFromMagicBytes(buf([0x50, 0x4b, 0x03, 0x04]))).toBe(
      null,
    );
    // SVG: "<svg" (XML テキスト、magic byte 不在で reject)
    expect(detectMediaMimeFromMagicBytes(buf([0x3c, 0x73, 0x76, 0x67]))).toBe(
      null,
    );
  });

  test("MP4 偽装 (4-7 が ftyp 以外) は null", () => {
    expect(
      detectMediaMimeFromMagicBytes(
        buf([0x00, 0x00, 0x00, 0x20, 0x66, 0x6f, 0x6f, 0x70]),
      ),
    ).toBe(null);
  });
});
