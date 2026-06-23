"use client";

import { useRef, type KeyboardEvent } from "react";

/**
 * WAI-ARIA APG radio group pattern の roving tabindex + 矢印キー実装。
 *
 * 仕様 (https://www.w3.org/WAI/ARIA/apg/patterns/radio/):
 * - Tab: グループ全体で 1 つの tab stop (checked の radio または最初の radio)
 * - Space: focus 中の radio が未 checked なら checked にする
 * - ArrowRight/ArrowDown (horizontal/vertical): 次の radio を checked + focus
 * - ArrowLeft/ArrowUp: 前の radio を checked + focus
 * - Home: 最初の radio を checked + focus
 * - End: 最後の radio を checked + focus
 * - 端での wrap あり (最後→最初 / 最初→最後)
 * - "selection follows focus": 矢印キーで checked が即時に切り替わる
 *
 * 利用側で role="radiogroup" を container に、role="radio" を各 item に付与する。
 */
export interface UseRadioGroupKeyboardOptions<TItem, TKey extends string> {
  readonly items: readonly TItem[];
  readonly selected: TKey | null;
  readonly onSelect: (key: TKey) => void;
  readonly getKey: (item: TItem) => TKey;
  /** 矢印キーのナビゲーション軸。
   * "horizontal" = Left/Right が active かつ Up/Down も active (デフォルト・APG 推奨)。
   * "vertical" = Up/Down のみ active。
   */
  readonly orientation?: "horizontal" | "vertical";
  /** すべての item が disabled の場合などに radio group 全体を skip させたいときに使う。 */
  readonly disabled?: boolean;
}

export interface RadioItemProps<TElement extends HTMLElement = HTMLElement> {
  readonly tabIndex: 0 | -1;
  readonly onKeyDown: (event: KeyboardEvent<TElement>) => void;
  readonly ref: (node: TElement | null) => void;
}

export interface UseRadioGroupKeyboardReturn<
  TItem,
  TElement extends HTMLElement = HTMLElement,
> {
  readonly getItemProps: (
    item: TItem,
    index: number,
  ) => RadioItemProps<TElement>;
}

export function useRadioGroupKeyboard<
  TItem,
  TKey extends string,
  TElement extends HTMLElement = HTMLElement,
>({
  items,
  selected,
  onSelect,
  getKey,
  orientation = "horizontal",
  disabled = false,
}: UseRadioGroupKeyboardOptions<TItem, TKey>): UseRadioGroupKeyboardReturn<
  TItem,
  TElement
> {
  const itemNodesRef = useRef<Array<TElement | null>>([]);

  const selectedIndex = items.findIndex((item) => getKey(item) === selected);
  // checked が無いときは最初の item が tab stop (APG)。
  const tabStopIndex = selectedIndex >= 0 ? selectedIndex : 0;

  const focusAndSelect = (nextIndex: number): void => {
    const next = items[nextIndex];
    if (!next) return;
    onSelect(getKey(next));
    itemNodesRef.current[nextIndex]?.focus();
  };

  const getItemProps = (
    item: TItem,
    index: number,
  ): RadioItemProps<TElement> => {
    const isTabStop = index === tabStopIndex;
    return {
      tabIndex: isTabStop ? 0 : -1,
      onKeyDown: (event) => {
        if (disabled) return;
        const { key } = event;
        const len = items.length;
        if (len === 0) return;

        let nextIndex: number | null = null;

        const isNextKey =
          orientation === "vertical"
            ? key === "ArrowDown"
            : key === "ArrowRight" || key === "ArrowDown";
        const isPrevKey =
          orientation === "vertical"
            ? key === "ArrowUp"
            : key === "ArrowLeft" || key === "ArrowUp";

        if (isNextKey) {
          nextIndex = (index + 1) % len;
        } else if (isPrevKey) {
          nextIndex = (index - 1 + len) % len;
        } else if (key === "Home") {
          nextIndex = 0;
        } else if (key === "End") {
          nextIndex = len - 1;
        } else if (key === " " || key === "Spacebar") {
          // Space: focus 中の radio が未 checked なら select。focus は移さない。
          event.preventDefault();
          onSelect(getKey(item));
          return;
        } else {
          return;
        }

        event.preventDefault();
        focusAndSelect(nextIndex);
      },
      ref: (node) => {
        itemNodesRef.current[index] = node;
      },
    };
  };

  return { getItemProps };
}
