import { describe, test, expect } from "bun:test";
import { mediaDataToSelectedMedia } from "@/admin/hooks/use-media-selection";
import type { MediaData } from "@/admin/types/media-picker";

function makeMediaData(overrides: Partial<MediaData> = {}): MediaData {
  return {
    id: "media-1",
    filename: "photo.jpg",
    url: "https://example.com/photo.jpg",
    mimeType: "image/jpeg",
    size: 12345,
    width: 1600,
    height: 900,
    type: "IMAGE",
    usage: "POST",
    alt: "サンプル画像",
    title: "サンプルタイトル",
    description: null,
    tags: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    uploader: null,
    ...overrides,
  };
}

describe("mediaDataToSelectedMedia", () => {
  test("width/height/title を SelectedMedia に伝播する", () => {
    const media = makeMediaData();

    const selected = mediaDataToSelectedMedia(media);

    expect(selected.width).toBe(1600);
    expect(selected.height).toBe(900);
    expect(selected.title).toBe("サンプルタイトル");
    expect(selected.alt).toBe("サンプル画像");
    expect(selected.id).toBe("media-1");
    expect(selected.url).toBe("https://example.com/photo.jpg");
    expect(selected.source).toBe("library");
  });

  test("width/height/title が null の場合は SelectedMedia 側のキー自体を省略する", () => {
    const media = makeMediaData({ width: null, height: null, title: null });

    const selected = mediaDataToSelectedMedia(media);

    expect(selected.width).toBeUndefined();
    expect(selected.height).toBeUndefined();
    expect(selected.title).toBeUndefined();
    expect("width" in selected).toBe(false);
    expect("height" in selected).toBe(false);
    expect("title" in selected).toBe(false);
  });

  test("音声ファイル等 alt が空でも title は独立して伝播する（AudioPlugin の空タイトル回帰防止）", () => {
    const media = makeMediaData({
      type: "AUDIO",
      mimeType: "audio/mpeg",
      width: null,
      height: null,
      alt: null,
      title: "楽曲タイトル",
    });

    const selected = mediaDataToSelectedMedia(media);

    expect(selected.alt).toBeUndefined();
    expect(selected.title).toBe("楽曲タイトル");
  });
});
