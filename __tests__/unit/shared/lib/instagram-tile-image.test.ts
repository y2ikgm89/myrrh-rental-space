/**
 * Instagram タイルの画像 URL 解決。
 *
 * VIDEO の `mediaUrl` は .mp4 の CDN URL で、そのまま `<Image src>` に渡すと
 * `/_next/image` が 400 を返してタイルが空箱になる（監査 F-37）。
 */

import { describe, expect, test } from "bun:test";

import { resolveInstagramTileImageUrl } from "@/shared/lib/instagram/tile-image";

const MP4 = "https://cdn.example.com/reel.mp4";
const JPG = "https://cdn.example.com/photo.jpg";
const THUMB = "https://cdn.example.com/thumb.jpg";

describe("resolveInstagramTileImageUrl", () => {
  test("VIDEO は thumbnailUrl を使う（mediaUrl の mp4 は使わない）", () => {
    expect(
      resolveInstagramTileImageUrl({
        mediaType: "VIDEO",
        mediaUrl: MP4,
        thumbnailUrl: THUMB,
      }),
    ).toBe(THUMB);
  });

  test("thumbnailUrl の無い VIDEO は null（呼び出し側の fallback へ）", () => {
    // ここで mp4 を返すと、タイルが空箱になったうえ 400 が毎回飛ぶ。
    expect(
      resolveInstagramTileImageUrl({
        mediaType: "VIDEO",
        mediaUrl: MP4,
        thumbnailUrl: null,
      }),
    ).toBeNull();
  });

  test("IMAGE は mediaUrl をそのまま使う", () => {
    expect(
      resolveInstagramTileImageUrl({
        mediaType: "IMAGE",
        mediaUrl: JPG,
        thumbnailUrl: THUMB,
      }),
    ).toBe(JPG);
  });

  test("CAROUSEL_ALBUM も mediaUrl", () => {
    expect(
      resolveInstagramTileImageUrl({
        mediaType: "CAROUSEL_ALBUM",
        mediaUrl: JPG,
        thumbnailUrl: null,
      }),
    ).toBe(JPG);
  });

  test("mediaUrl が無い IMAGE は thumbnailUrl に落ちる", () => {
    expect(
      resolveInstagramTileImageUrl({
        mediaType: "IMAGE",
        mediaUrl: null,
        thumbnailUrl: THUMB,
      }),
    ).toBe(THUMB);
  });

  test("どちらも無ければ null", () => {
    expect(
      resolveInstagramTileImageUrl({
        mediaType: "IMAGE",
        mediaUrl: null,
        thumbnailUrl: null,
      }),
    ).toBeNull();
  });
});
