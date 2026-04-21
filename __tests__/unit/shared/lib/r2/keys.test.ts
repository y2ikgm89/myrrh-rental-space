import { describe, test, expect } from "bun:test";
import {
  STORAGE_PREFIXES,
  generateStorageKey,
  buildPublicUrl,
  extractKeyFromUrl,
  type StoragePrefix,
} from "@/shared/lib/r2/keys";

describe("STORAGE_PREFIXES", () => {
  test("4 つの prefix をすべて持つ", () => {
    expect(STORAGE_PREFIXES.SPACES).toBe("spaces");
    expect(STORAGE_PREFIXES.POSTS).toBe("posts");
    expect(STORAGE_PREFIXES.SITE).toBe("site");
    expect(STORAGE_PREFIXES.MEDIA).toBe("media");
  });
});

describe("generateStorageKey", () => {
  test("prefix + folder + timestamp + uuid + ext で key を生成", () => {
    const key = generateStorageKey({
      prefix: STORAGE_PREFIXES.SPACES,
      filename: "photo.jpg",
      folder: "space-1",
    });
    expect(key).toMatch(/^spaces\/space-1\/\d+-[0-9a-f-]+\.jpg$/);
  });

  test("folder 省略時は prefix 直下に配置", () => {
    const key = generateStorageKey({
      prefix: STORAGE_PREFIXES.MEDIA,
      filename: "doc.pdf",
    });
    expect(key).toMatch(/^media\/\d+-[0-9a-f-]+\.pdf$/);
  });

  test("大文字拡張子は小文字化", () => {
    const key = generateStorageKey({
      prefix: STORAGE_PREFIXES.POSTS,
      filename: "IMAGE.PNG",
    });
    expect(key).toMatch(/\.png$/);
  });

  test("拡張子なしファイルは ext 空で生成", () => {
    const key = generateStorageKey({
      prefix: STORAGE_PREFIXES.MEDIA,
      filename: "noext",
    });
    expect(key).toMatch(/^media\/\d+-[0-9a-f-]+$/);
  });
});

describe("buildPublicUrl", () => {
  test("publicUrl + key を連結", () => {
    const url = buildPublicUrl(
      "spaces/abc/123.jpg",
      "https://media.example.com",
    );
    expect(url).toBe("https://media.example.com/spaces/abc/123.jpg");
  });

  test("publicUrl の末尾スラッシュは正規化", () => {
    const url = buildPublicUrl("media/x.jpg", "https://media.example.com/");
    expect(url).toBe("https://media.example.com/media/x.jpg");
  });

  test("key 先頭のスラッシュは正規化", () => {
    const url = buildPublicUrl("/spaces/y.jpg", "https://media.example.com");
    expect(url).toBe("https://media.example.com/spaces/y.jpg");
  });
});

describe("extractKeyFromUrl", () => {
  test("public URL から key 部分のみ抽出", () => {
    const key = extractKeyFromUrl(
      "https://media.example.com/spaces/abc/123.jpg",
      "https://media.example.com",
    );
    expect(key).toBe("spaces/abc/123.jpg");
  });

  test("末尾スラッシュ混在でも抽出", () => {
    const key = extractKeyFromUrl(
      "https://media.example.com/media/x.png",
      "https://media.example.com/",
    );
    expect(key).toBe("media/x.png");
  });

  test("public URL に一致しない URL は null", () => {
    const key = extractKeyFromUrl(
      "https://other.example.com/foo.jpg",
      "https://media.example.com",
    );
    expect(key).toBeNull();
  });
});

describe("StoragePrefix 型", () => {
  test("各 prefix は StoragePrefix に代入可能", () => {
    const values: StoragePrefix[] = [
      STORAGE_PREFIXES.SPACES,
      STORAGE_PREFIXES.POSTS,
      STORAGE_PREFIXES.SITE,
      STORAGE_PREFIXES.MEDIA,
    ];
    expect(values).toHaveLength(4);
  });
});
