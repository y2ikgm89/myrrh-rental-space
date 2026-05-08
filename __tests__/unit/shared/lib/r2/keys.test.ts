import { describe, test, expect } from "bun:test";
import {
  STORAGE_PREFIXES,
  generateStorageKey,
  buildPublicUrl,
  extractKeyFromUrl,
  isValidStorageFolder,
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

describe("isValidStorageFolder", () => {
  test("英数字・ハイフンの slug を許可", () => {
    expect(isValidStorageFolder("space-1")).toBe(true);
    expect(isValidStorageFolder("abc123")).toBe(true);
    expect(isValidStorageFolder("a")).toBe(true);
  });

  test("path traversal / 大文字 / 記号は拒否", () => {
    expect(isValidStorageFolder("../etc")).toBe(false);
    expect(isValidStorageFolder("space/sub")).toBe(false);
    expect(isValidStorageFolder("Space")).toBe(false);
    expect(isValidStorageFolder("space_1")).toBe(false);
    expect(isValidStorageFolder("space.1")).toBe(false);
  });

  test("空文字 / 64 文字超 / 先頭末尾ハイフンは拒否", () => {
    expect(isValidStorageFolder("")).toBe(false);
    expect(isValidStorageFolder("a".repeat(65))).toBe(false);
    expect(isValidStorageFolder("-foo")).toBe(false);
    expect(isValidStorageFolder("foo-")).toBe(false);
  });
});

describe("generateStorageKey", () => {
  test("MIME 由来の拡張子で key を生成（image/jpeg → .jpg）", () => {
    const key = generateStorageKey({
      prefix: STORAGE_PREFIXES.SPACES,
      contentType: "image/jpeg",
      folder: "space-1",
    });
    expect(key).toMatch(/^spaces\/space-1\/\d+-[0-9a-f-]+\.jpg$/);
  });

  test("PNG / WebP / GIF も MIME → 公式拡張子", () => {
    expect(
      generateStorageKey({
        prefix: STORAGE_PREFIXES.MEDIA,
        contentType: "image/png",
      }),
    ).toMatch(/\.png$/);
    expect(
      generateStorageKey({
        prefix: STORAGE_PREFIXES.MEDIA,
        contentType: "image/webp",
      }),
    ).toMatch(/\.webp$/);
    expect(
      generateStorageKey({
        prefix: STORAGE_PREFIXES.MEDIA,
        contentType: "image/gif",
      }),
    ).toMatch(/\.gif$/);
  });

  test("folder 省略時は prefix 直下に配置", () => {
    const key = generateStorageKey({
      prefix: STORAGE_PREFIXES.MEDIA,
      contentType: "image/png",
    });
    expect(key).toMatch(/^media\/\d+-[0-9a-f-]+\.png$/);
  });

  test("不正な folder（path traversal）は throw", () => {
    expect(() =>
      generateStorageKey({
        prefix: STORAGE_PREFIXES.SPACES,
        contentType: "image/jpeg",
        folder: "../etc",
      }),
    ).toThrow(/Invalid storage folder/);
  });

  test("不正な folder（slash）は throw", () => {
    expect(() =>
      generateStorageKey({
        prefix: STORAGE_PREFIXES.SPACES,
        contentType: "image/jpeg",
        folder: "space/sub",
      }),
    ).toThrow(/Invalid storage folder/);
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
