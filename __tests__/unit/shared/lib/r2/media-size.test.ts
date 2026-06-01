import { describe, test, expect } from "bun:test";
import {
  MEDIA_MAX_SIZE_BYTES,
  MAX_FILE_SIZES,
} from "@/shared/lib/r2/media-size";

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

describe("MAX_FILE_SIZES", () => {
  test("MediaType 別上限が per-MIME canonical (MEDIA_MAX_SIZE_BYTES) から派生する", () => {
    expect(MAX_FILE_SIZES.IMAGE).toBe(MEDIA_MAX_SIZE_BYTES["image/jpeg"]);
    expect(MAX_FILE_SIZES.VIDEO).toBe(MEDIA_MAX_SIZE_BYTES["video/mp4"]);
    expect(MAX_FILE_SIZES.AUDIO).toBe(MEDIA_MAX_SIZE_BYTES["audio/mpeg"]);
    expect(MAX_FILE_SIZES.DOCUMENT).toBe(
      MEDIA_MAX_SIZE_BYTES["application/pdf"],
    );
  });

  test("画像5MB/動画50MB/音声20MB/文書10MB（canonical 値）", () => {
    expect(MAX_FILE_SIZES.IMAGE).toBe(5 * 1024 * 1024);
    expect(MAX_FILE_SIZES.VIDEO).toBe(50 * 1024 * 1024);
    expect(MAX_FILE_SIZES.AUDIO).toBe(20 * 1024 * 1024);
    expect(MAX_FILE_SIZES.DOCUMENT).toBe(10 * 1024 * 1024);
  });

  test("OTHER は magic-byte 非対応カテゴリ (SVG 等) のため文書と同じ 10MB", () => {
    expect(MAX_FILE_SIZES.OTHER).toBe(10 * 1024 * 1024);
  });
});
