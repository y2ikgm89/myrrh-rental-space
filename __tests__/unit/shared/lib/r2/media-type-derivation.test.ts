import { describe, expect, test } from "bun:test";
import { deriveMediaTypeFromMime } from "@/shared/lib/r2/media-type-derivation";
import { MediaType } from "@/shared/lib/validations/enums/prisma-types";

describe("deriveMediaTypeFromMime", () => {
  test("画像 MIME は IMAGE", () => {
    expect(deriveMediaTypeFromMime("image/jpeg")).toBe(MediaType.IMAGE);
  });

  test("動画 MIME は VIDEO", () => {
    expect(deriveMediaTypeFromMime("video/mp4")).toBe(MediaType.VIDEO);
    expect(deriveMediaTypeFromMime("video/webm")).toBe(MediaType.VIDEO);
  });

  test("音声 MIME（mpeg / wav / webm）は AUDIO", () => {
    expect(deriveMediaTypeFromMime("audio/mpeg")).toBe(MediaType.AUDIO);
    expect(deriveMediaTypeFromMime("audio/wav")).toBe(MediaType.AUDIO);
    expect(deriveMediaTypeFromMime("audio/webm")).toBe(MediaType.AUDIO);
  });

  test("PDF は DOCUMENT", () => {
    expect(deriveMediaTypeFromMime("application/pdf")).toBe(MediaType.DOCUMENT);
  });
});
