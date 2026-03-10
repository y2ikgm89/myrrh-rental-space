import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { openPreview } from "@/admin/hooks";

describe("preview routing", () => {
  const openSpy = mock(() => null);

  beforeEach(() => {
    Reflect.set(globalThis, "window", { open: openSpy });
  });

  afterEach(() => {
    openSpy.mockClear();
    Reflect.deleteProperty(globalThis, "window");
  });

  test("投稿 preview は dedicated route を開く", () => {
    openPreview("post", "hello-world", "/posts");

    expect(openSpy).toHaveBeenCalledWith(
      "/posts/preview/hello-world",
      "_blank",
    );
  });

  test("ニュース preview は dedicated route を開く", () => {
    openPreview("news", "release-note", "/news");

    expect(openSpy).toHaveBeenCalledWith(
      "/news/preview/release-note",
      "_blank",
    );
  });
});
