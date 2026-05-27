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
 * フローティング要素の位置を設定（公式 Playground と同一アルゴリズム）
 *
 * 判断基準:
 *   - デフォルト: 選択範囲の「上」に配置（`targetRect.top - toolbarHeight - gap`）
 *   - フォールバック「下」配置: 上に置くと scroller 可視領域の上端を超える場合
 *     `top < editorScrollerRect.top` で判定（anchor ではなく scroller の top
 *     を使うのが重要。スクロール時 anchor.top は負値になり判定が機能しない）
 *   - text-align: right / end のとき: 選択範囲の右端基準に left 配置
 *
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

  const anchorElementRect = anchorElem.getBoundingClientRect();
  const editorScrollerRect = scrollerElem.getBoundingClientRect();

  // scroller 幅を超える toolbar は内部で flex-wrap させて多段化する
  // (Inspector 開閉や狭い viewport で natural width > scroller width となる
  //  場合、`overflow-y: auto` 由来の `overflow-x: auto` 化で右端が切れる
  //  silent bug を防ぐ)。maxWidth を計測前に確定する必要があるため
  //  floatingElemRect の取得はこの後に行う。
  const maxFloatingWidth = Math.max(
    0,
    editorScrollerRect.width - horizontalOffset * 2,
  );
  floatingElem.style.maxWidth = `${maxFloatingWidth}px`;

  const floatingElemRect = floatingElem.getBoundingClientRect();

  let top = targetRect.top - floatingElemRect.height - verticalGap;
  let left = targetRect.left - horizontalOffset;

  // text-align: right / end の場合、選択範囲の右端基準に配置
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const textNode = range.startContainer;
    const textElement =
      textNode instanceof Element ? textNode : textNode.parentElement;
    if (textElement) {
      const textAlign = window.getComputedStyle(textElement).textAlign;
      if (textAlign === "right" || textAlign === "end") {
        left = targetRect.right - floatingElemRect.width + horizontalOffset;
      }
    }
  }

  // 上に置くと scroller 上端を超える場合は選択範囲の下にフォールバック
  // 数式: top += toolbarHeight + targetHeight + 2 * gap
  //     = (targetRect.top - toolbarHeight - gap) + toolbarHeight + targetHeight + 2*gap
  //     = targetRect.bottom + gap
  if (top < editorScrollerRect.top) {
    top += floatingElemRect.height + targetRect.height + verticalGap * 2;
  }

  // 左右境界クランプ（scroller 幅を基準に）
  if (left + floatingElemRect.width > editorScrollerRect.right) {
    left = editorScrollerRect.right - floatingElemRect.width - horizontalOffset;
  }
  if (left < editorScrollerRect.left) {
    left = editorScrollerRect.left + horizontalOffset;
  }

  // anchor 要素からの相対座標に変換（transform 値用）
  top -= anchorElementRect.top;
  left -= anchorElementRect.left;

  floatingElem.style.opacity = "1";
  floatingElem.style.transform = `translate(${left}px, ${top}px)`;
}
