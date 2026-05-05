"use client";

import { useEffect, useState } from "react";

/**
 * 記事の読書進捗を表示するブロンズの極細プログレスバー（1px hairline）。
 *
 * - 監視対象は `<article>` 要素。article の top→bottom を 0%→100% にマップ
 * - `scroll` / `resize` イベントを `passive` で listen（メインスレッドブロックなし）
 * - `transform: scaleX()` で再描画コスト最小化（layout / paint 不発生）
 * - `prefers-reduced-motion` 環境では transition を CSS 側で 0.01ms に短縮（public.css の base layer）
 *
 * a11y: WAI-ARIA 1.2 progressbar pattern
 *   - `role="progressbar"` + `aria-valuenow` / `aria-valuemin` / `aria-valuemax`
 *   - `aria-label="読書進捗"` で視覚障害ユーザーに位置情報を提供
 */
export function ArticleReadingProgress(): React.ReactElement {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const article = document.querySelector("article");
    if (!article) return;

    let rafId: number | null = null;

    const compute = () => {
      rafId = null;
      const rect = article.getBoundingClientRect();
      const start = rect.top + window.scrollY;
      const end = start + rect.height - window.innerHeight;
      const denominator = end - start;
      if (denominator <= 0) {
        setProgress(rect.bottom <= window.innerHeight ? 1 : 0);
        return;
      }
      const ratio = (window.scrollY - start) / denominator;
      setProgress(Math.max(0, Math.min(1, ratio)));
    };

    const schedule = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(compute);
    };

    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  const percent = Math.round(progress * 100);

  return (
    <div
      role="progressbar"
      aria-label="読書進捗"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-px w-full overflow-hidden bg-foreground/10"
    >
      <div
        aria-hidden="true"
        className="h-full origin-left bg-accent transition-transform duration-150 ease-out"
        style={{ transform: `scaleX(${progress})` }}
      />
    </div>
  );
}
