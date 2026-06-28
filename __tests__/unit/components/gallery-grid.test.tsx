/**
 * GalleryGrid — ユニットテスト
 *
 * カバレッジ対象:
 *  1. 0 件 → null 描画
 *  2. 5 件 (全画像) → 4-up グリッド + "+1" overlay + overlay クリックで lightbox が開く
 *  3. 5 件 (4 画像 + 1 動画 overflow) → overlay count が画像ベース、overlay クリックで lightbox が開く
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

// next/image — fill モードで絶対配置 img にする最小 stub
mock.module("next/image", () => ({
  default: ({
    src,
    alt,
    fill: _fill,
    sizes: _sizes,
    className,
  }: {
    src: string;
    alt: string;
    fill?: boolean;
    sizes?: string;
    className?: string;
  }) => (
    <img
      src={src}
      alt={alt}
      className={className}
      data-testid="gallery-image"
    />
  ),
}));

// GalleryLightbox — 開閉状態だけ確認できる最小 stub
mock.module("@/shared/components/gallery/GalleryLightbox", () => ({
  GalleryLightbox: ({
    open,
    onOpenChange,
    initialIndex,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialIndex: number;
    items: unknown[];
  }) =>
    open ? (
      <div
        data-testid="lightbox"
        data-initial-index={initialIndex}
        role="dialog"
      >
        <button
          type="button"
          data-testid="lightbox-close"
          onClick={() => onOpenChange(false)}
        >
          close
        </button>
      </div>
    ) : null,
}));

// @/shared/lib/cn — シンプル結合
mock.module("@/shared/lib/cn", () => ({
  cn: (...args: unknown[]) =>
    args
      .flatMap((a) => (typeof a === "string" ? a : []))
      .filter(Boolean)
      .join(" "),
}));

// @/shared/lib/media/detect-media-type — URL 末尾が .mp4 なら video、それ以外は image
mock.module("@/shared/lib/media/detect-media-type", () => ({
  detectMediaSourceType: (url: string) =>
    url.endsWith(".mp4") ? "video" : "image",
  isImageUrl: (url: string) => !url.endsWith(".mp4"),
}));

const { GalleryGrid } = await import("@/shared/components/gallery/GalleryGrid");

// ---

describe("GalleryGrid", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    container = window.document.createElement("div");
    window.document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    root = undefined;
    container = undefined;
  });

  // ── Case 1: 0 件 → null ──────────────────────────────────────────────────

  test("0 件のとき null を描画する", async () => {
    await act(async () => {
      root?.render(<GalleryGrid items={[]} />);
    });

    // コンテナが空であること
    expect(container?.childElementCount).toBe(0);
  });

  // ── Case 1b: 1 件 → 1 カラム全幅 ────────────────────────────────────────

  test("1 件のとき grid-cols-1 クラスが付く", async () => {
    const items = [
      { url: "https://cdn.example.com/img1.jpg", alt: "img1", caption: "" },
    ];

    await act(async () => {
      root?.render(<GalleryGrid items={items} />);
    });

    const grid = container?.querySelector(".grid");
    expect(grid?.className).toContain("grid-cols-1");
    const images = container?.querySelectorAll("[data-testid='gallery-image']");
    expect(images?.length).toBe(1);
  });

  // ── Case 1c: 2 件 → 2 カラム ─────────────────────────────────────────────

  test("2 件のとき grid-cols-2 クラスが付く", async () => {
    const items = Array.from({ length: 2 }, (_, i) => ({
      url: `https://cdn.example.com/img${i + 1}.jpg`,
      alt: `image ${i + 1}`,
      caption: "",
    }));

    await act(async () => {
      root?.render(<GalleryGrid items={items} />);
    });

    const grid = container?.querySelector(".grid");
    expect(grid?.className).toContain("grid-cols-2");
    const images = container?.querySelectorAll("[data-testid='gallery-image']");
    expect(images?.length).toBe(2);
  });

  // ── Case 1d: 3 件 → 3 カラム ─────────────────────────────────────────────

  test("3 件のとき grid-cols-3 クラスが付く", async () => {
    const items = Array.from({ length: 3 }, (_, i) => ({
      url: `https://cdn.example.com/img${i + 1}.jpg`,
      alt: `image ${i + 1}`,
      caption: "",
    }));

    await act(async () => {
      root?.render(<GalleryGrid items={items} />);
    });

    const grid = container?.querySelector(".grid");
    expect(grid?.className).toContain("grid-cols-3");
    const images = container?.querySelectorAll("[data-testid='gallery-image']");
    expect(images?.length).toBe(3);
  });

  // ── Case 1e: 4 件 → 2×2 グリッド ──────────────────────────────────────────

  test("4 件のとき grid-cols-2 grid-rows-2 クラスが付く", async () => {
    const items = Array.from({ length: 4 }, (_, i) => ({
      url: `https://cdn.example.com/img${i + 1}.jpg`,
      alt: `image ${i + 1}`,
      caption: "",
    }));

    await act(async () => {
      root?.render(<GalleryGrid items={items} />);
    });

    const grid = container?.querySelector(".grid");
    expect(grid?.className).toContain("grid-cols-2");
    expect(grid?.className).toContain("grid-rows-2");
    const images = container?.querySelectorAll("[data-testid='gallery-image']");
    expect(images?.length).toBe(4);
    // オーバーレイは出ない
    expect(container?.querySelector("button[aria-label^='他']")).toBeNull();
  });

  // ── Case hero prop ──────────────────────────────────────────────────────────

  test("hero prop が指定されると先頭に仮想挿入されて描画される", async () => {
    const heroUrl = "https://cdn.example.com/hero.jpg";
    const items = [
      { url: "https://cdn.example.com/img1.jpg", alt: "img1", caption: "" },
    ];

    await act(async () => {
      root?.render(<GalleryGrid items={items} hero={heroUrl} />);
    });

    // hero + items = 2 件 → 2 カラム、2 枚描画
    const images = container?.querySelectorAll<HTMLImageElement>(
      "[data-testid='gallery-image']",
    );
    expect(images?.length).toBe(2);
    // 先頭が hero
    const first = images?.[0];
    expect(first?.src).toContain("hero.jpg");
  });

  // ── Case 2: 5 件 (全画像) → 4-up グリッド + "+1" overlay ──────────────

  test("5 件 (全画像) → 4 タイル描画 + '+1' overlay + overlay クリックで lightbox が開く", async () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      url: `https://cdn.example.com/img${i + 1}.jpg`,
      alt: `image ${i + 1}`,
      caption: "",
    }));

    await act(async () => {
      root?.render(<GalleryGrid items={items} />);
    });

    // 4 タイルのみ表示される（displayLimit = 4）
    const images = container?.querySelectorAll("[data-testid='gallery-image']");
    expect(images?.length).toBe(4);

    // "+1" overlay ボタンが存在する（5件のうち1件が非表示 → 画像ベースで +1）
    const overlayBtn = container?.querySelector(
      "button[aria-label='他 1 枚の画像を表示']",
    );
    expect(overlayBtn).not.toBeNull();
    expect(overlayBtn?.textContent?.trim()).toBe("+1");

    // lightbox はまだ閉じている
    expect(container?.querySelector("[data-testid='lightbox']")).toBeNull();

    // overlay クリック → lightbox が開く
    await act(async () => {
      overlayBtn?.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true }),
      );
    });

    const lightbox = container?.querySelector("[data-testid='lightbox']");
    expect(lightbox).not.toBeNull();
  });

  // ── Case 3: 5 件 (4 画像 + 1 動画 overflow) ─────────────────────────────

  test("5 件 (4 画像 + 1 動画 overflow) → overlay count が画像ベース (0 件) で overlay 非表示", async () => {
    // タイル 1–4 は画像、タイル 5 は動画（overflow タイル）
    const items = [
      ...Array.from({ length: 4 }, (_, i) => ({
        url: `https://cdn.example.com/img${i + 1}.jpg`,
        alt: `image ${i + 1}`,
        caption: "",
      })),
      { url: "https://cdn.example.com/video.mp4", alt: "video", caption: "" },
    ];

    await act(async () => {
      root?.render(<GalleryGrid items={items} />);
    });

    // 動画 overflow は画像ベースカウントに含まれないため hiddenImageCount = 0
    // → overlay ボタンは描画されない
    const overlayBtn = container?.querySelector("button[aria-label^='他']");
    expect(overlayBtn).toBeNull();
  });

  test("5 件 (3 画像 + 1 動画表示 + 1 画像 overflow) → overlay count = 1 (画像のみ)", async () => {
    // 表示タイル: img1, img2, img3, video.mp4 (動画)
    // overflow タイル: img4.jpg (画像 1 件)
    const items = [
      { url: "https://cdn.example.com/img1.jpg", alt: "img1", caption: "" },
      { url: "https://cdn.example.com/img2.jpg", alt: "img2", caption: "" },
      { url: "https://cdn.example.com/img3.jpg", alt: "img3", caption: "" },
      { url: "https://cdn.example.com/video.mp4", alt: "video", caption: "" },
      { url: "https://cdn.example.com/img4.jpg", alt: "img4", caption: "" },
    ];

    await act(async () => {
      root?.render(<GalleryGrid items={items} />);
    });

    // "+1" overlay (img4 が隠れた画像)
    const overlayBtn = container?.querySelector(
      "button[aria-label='他 1 枚の画像を表示']",
    );
    expect(overlayBtn).not.toBeNull();
    expect(overlayBtn?.textContent?.trim()).toBe("+1");

    // overlay クリック → lightbox が開く
    await act(async () => {
      overlayBtn?.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true }),
      );
    });

    expect(container?.querySelector("[data-testid='lightbox']")).not.toBeNull();
  });
});
