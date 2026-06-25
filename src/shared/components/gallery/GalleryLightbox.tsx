"use client";

/**
 * GalleryLightbox — native <dialog> ベースの画像ライトボックス primitive
 *
 * GallerySection の lightbox 実装を section chrome 非依存のコンポーネントに抽出。
 * 動画はインライン再生する GalleryGrid 側の責務のため、本コンポーネントは画像専用。
 *
 * 機能:
 * - iOS Safari body-lock（position:fixed + scrollY 復帰）
 * - キーボードナビ（←/→ / Escape はネイティブ <dialog> が処理）
 * - タッチスワイプ（dx > 50px で前後送り）
 * - 複数画像時のみ前後ナビゲーションボタンを表示
 *
 * @remarks initialIndex は初回マウント時のみ参照される。
 * 別の index で開き直す場合は <GalleryLightbox key={initialIndex} ... /> でリマウントすること。
 */

import { useEffect, useRef, useState, type ReactElement } from "react";
import Image from "next/image";
import { IconChevronLeft, IconChevronRight, IconX } from "@tabler/icons-react";
import type { GalleryItem } from "@/shared/lib/validations/gallery";

interface GalleryLightboxProps {
  readonly items: readonly GalleryItem[];
  readonly initialIndex: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function GalleryLightbox({
  items,
  initialIndex,
  open,
  onOpenChange,
}: GalleryLightboxProps): ReactElement | null {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const touchStartXRef = useRef<number | null>(null);
  // initialIndex は「最初に開いたとき」の位置として一度だけ使う。
  // 同じ items で別の index で開き直す場合は呼び出し側が key を変えてリマウントする。
  const [index, setIndex] = useState<number>(initialIndex);

  // open 変化で <dialog> の showModal / close を同期する
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // iOS Safari は <dialog> 表示中も背後 body がスクロールできてしまう（WebKit）。
  // position:fixed 方式で body をロックし、閉じたら元のスクロール位置に復帰する。
  // GallerySection L59-82 と同一パターン。
  //
  // scrollY を ref で保持する理由:
  //   GalleryGrid は key={lightboxIndex} でこのコンポーネントをリマウントするため、
  //   open=true の effect が再実行される際に body がすでに position:fixed 状態だと
  //   window.scrollY が 0 になりうる（position:fixed 直後の再マウント競合）。
  //   ref に初回 open 時の値をキャプチャし、unmount cleanup で安全に復帰させる。
  const scrollYRef = useRef<number | null>(null);
  useEffect(() => {
    if (!open) return;
    // body がまだ fixed されていない初回 open 時にだけ scrollY をキャプチャする
    if (scrollYRef.current === null) {
      scrollYRef.current = window.scrollY;
    }
    const scrollY = scrollYRef.current;
    const body = document.body;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
      scrollYRef.current = null;
    };
  }, [open]);

  const navigate = (direction: 1 | -1) => {
    setIndex((prev) => {
      const next = prev + direction;
      if (next < 0) return items.length - 1;
      if (next >= items.length) return 0;
      return next;
    });
  };

  // キーボード（←/→）での画像送り。Escape は native <dialog> が onClose を発火。
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    if (items.length <= 1) return;
    if (e.key === "ArrowLeft") navigate(-1);
    else if (e.key === "ArrowRight") navigate(1);
  };

  // タッチスワイプでの画像送り（モバイルの主操作）
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0]?.clientX ?? null;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || items.length <= 1) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartXRef.current;
    if (Math.abs(dx) > 50) navigate(dx < 0 ? 1 : -1);
    touchStartXRef.current = null;
  };

  const current = items[index];
  if (!current) return null;

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-50 m-0 h-full w-full max-h-full max-w-full overscroll-contain bg-background/95 backdrop:bg-background/80"
      onClick={(e) => {
        if (e.target === dialogRef.current) onOpenChange(false);
      }}
      onClose={() => onOpenChange(false)}
      onKeyDown={handleKeyDown}
    >
      <div className="relative flex h-full w-full flex-col items-center justify-center p-4">
        {/* 閉じるボタン */}
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="閉じる"
          className="absolute right-4 top-4 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface/80 text-muted-foreground transition-colors duration-200 hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <IconX className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
        </button>

        {/* 前へボタン（複数画像時のみ） */}
        {items.length > 1 && (
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="前の画像"
            className="absolute left-2 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface/80 text-muted-foreground transition-colors duration-200 hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <IconChevronLeft
              className="h-5 w-5"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </button>
        )}

        {/* 画像エリア（スワイプ検知も兼ねる） */}
        <div
          className="flex max-h-[80svh] max-w-[90vw] items-center"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <Image
            src={current.url}
            alt={current.alt}
            width={1200}
            height={800}
            sizes="90vw"
            className="max-h-[80svh] w-auto object-contain"
          />
        </div>

        {/* 次へボタン（複数画像時のみ） */}
        {items.length > 1 && (
          <button
            type="button"
            onClick={() => navigate(1)}
            aria-label="次の画像"
            className="absolute right-2 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface/80 text-muted-foreground transition-colors duration-200 hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <IconChevronRight
              className="h-5 w-5"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </button>
        )}

        {/* キャプション */}
        {current.caption.length > 0 && (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {current.caption}
          </p>
        )}
      </div>
    </dialog>
  );
}
