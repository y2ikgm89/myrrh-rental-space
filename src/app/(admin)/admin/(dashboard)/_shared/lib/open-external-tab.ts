"use client";

export function openExternalTab(url: string | URL): Window | null {
  return window.open(url.toString(), "_blank", "noreferrer");
}

/**
 * `await` を挟んだ後（保存 → プレビュー等）に別タブを開くための SSoT。
 *
 * `window.open(url, "_blank", "noreferrer")` は noreferrer 指定で戻り値が null になり
 * browsing context が分離するうえ、async gap 後の呼び出しは user gesture を失って
 * popup blocker に弾かれやすい。動的 `<a target="_blank" rel="noreferrer">` + `.click()`
 * は gesture を引き継ぎ、HTML Living Standard 準拠で noreferrer も維持する
 * (admin の全 `_blank` に noreferrer 必須の architecture-boundaries 規律と整合)。
 */
export function openPreviewTab(url: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noreferrer";
  anchor.click();
}
