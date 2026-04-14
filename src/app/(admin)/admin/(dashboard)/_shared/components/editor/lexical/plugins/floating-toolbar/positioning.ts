/**
 * Floating Toolbar positioning utilities (公式Playgroundパターン準拠)
 */

/**
 * DOM選択範囲の矩形を取得
 * @see https://github.com/facebook/lexical/blob/main/packages/lexical-playground/src/utils/getDOMRangeRect.ts
 */
export function getDOMRangeRect(
  nativeSelection: Selection,
  rootElement: HTMLElement,
): DOMRect {
  const domRange = nativeSelection.getRangeAt(0);

  if (nativeSelection.anchorNode === rootElement) {
    let inner = rootElement;
    while (inner.firstElementChild instanceof HTMLElement) {
      inner = inner.firstElementChild;
    }
    return inner.getBoundingClientRect();
  }

  return domRange.getBoundingClientRect();
}

/**
 * フローティング要素の位置を設定
 * @see https://github.com/facebook/lexical/blob/main/packages/lexical-playground/src/utils/setFloatingElemPosition.ts
 */
export function setFloatingElemPosition(
  targetRect: DOMRect | null,
  floatingElem: HTMLElement,
  anchorElem: HTMLElement,
  verticalGap: number = 10,
  horizontalOffset: number = 5,
): void {
  const scrollerElem = anchorElem.parentElement;

  if (targetRect === null || !scrollerElem) {
    floatingElem.style.opacity = "0";
    floatingElem.style.transform = "translate(-10000px, -10000px)";
    return;
  }

  const floatingElemRect = floatingElem.getBoundingClientRect();
  const anchorElementRect = anchorElem.getBoundingClientRect();
  const editorScrollerRect = scrollerElem.getBoundingClientRect();

  let top = targetRect.top - floatingElemRect.height - verticalGap;
  let left = targetRect.left - horizontalOffset;

  // 固定ツールバーに重なる場合は選択テキストの下に配置
  if (top < anchorElementRect.top) {
    top = targetRect.bottom + verticalGap;
  }

  // 左端境界チェック
  if (left < editorScrollerRect.left) {
    left = editorScrollerRect.left + horizontalOffset;
  }

  // 右端境界チェック
  if (left + floatingElemRect.width > editorScrollerRect.right) {
    left = editorScrollerRect.right - floatingElemRect.width - horizontalOffset;
  }

  // アンカー要素からの相対位置に変換
  top -= anchorElementRect.top;
  left -= anchorElementRect.left;

  floatingElem.style.opacity = "1";
  floatingElem.style.transform = `translate(${left}px, ${top}px)`;
}
