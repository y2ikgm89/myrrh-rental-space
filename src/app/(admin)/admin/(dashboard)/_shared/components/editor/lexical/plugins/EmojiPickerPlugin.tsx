/**
 * Emoji Picker Plugin
 *
 * @description ":"をトリガーに絵文字ピッカーを表示するプラグイン
 *
 * TypeaheadMenuPluginを使用して候補リストを表示
 * 選択時はTextNodeに絵文字文字を直接挿入
 *
 * バンドル最適化:
 * 内蔵絵文字データ (~318KB) は `emoji-list.json` に切り出し、
 * `:` トリガー発火時にだけ動的 import で取得する。
 * これにより admin editor 初期 chunk から本データを除外する。
 */

"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { cn } from "@/shared/lib/cn";
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from "@lexical/react/LexicalTypeaheadMenuPlugin";
import { TextNode, $createTextNode, $insertNodes } from "lexical";

// =============================================================================
// Types
// =============================================================================

interface EmojiEntry {
  emoji: string;
  keywords: string[];
}

// =============================================================================
// Menu Option Class
// =============================================================================

class EmojiOption extends MenuOption {
  emoji: string;
  keywords: string[];

  constructor(emoji: string, keywords: string[]) {
    super(emoji);
    this.emoji = emoji;
    this.keywords = keywords;
  }
}

// =============================================================================
// Component
// =============================================================================

export function EmojiPickerPlugin() {
  const [editor] = useLexicalComposerContext();
  const [queryString, setQueryString] = useState<string | null>(null);
  const [emojiList, setEmojiList] = useState<EmojiEntry[] | null>(null);

  // トリガー: ":" で発火
  const checkForTriggerMatch = useBasicTypeaheadTriggerMatch(":", {
    minLength: 1, // 最低1文字入力後に候補表示
  });

  // 動的 import: ":" トリガー発火後 (queryString が非 null) 初回にだけ読み込む
  // emoji-list.json は ~318KB あり、admin editor 初期 chunk から除外する目的
  useEffect(() => {
    if (queryString === null || emojiList !== null) return;
    let cancelled = false;
    void import("./emoji-list.json").then((mod) => {
      if (cancelled) return;
      setEmojiList(mod.default as EmojiEntry[]);
    });
    return () => {
      cancelled = true;
    };
  }, [queryString, emojiList]);

  // オプション生成
  const options = (() => {
    if (!queryString || !emojiList) return [];

    const lowerQuery = queryString.toLowerCase();

    // キーワードマッチでフィルタリング
    const filtered = emojiList.filter((item) =>
      item.keywords.some((kw) => kw.includes(lowerQuery)),
    );

    // 上位15件に制限
    return filtered
      .slice(0, 15)
      .map((item) => new EmojiOption(item.emoji, item.keywords));
  })();

  const onSelectOption = (
    selectedOption: EmojiOption,
    nodeToRemove: TextNode | null,
    closeMenu: () => void,
    _matchingString: string,
  ) => {
    editor.update(() => {
      if (!selectedOption) return;

      // トリガー文字（":keyword"）を削除
      if (nodeToRemove) {
        nodeToRemove.remove();
      }

      // 絵文字をTextNodeとして挿入
      $insertNodes([$createTextNode(selectedOption.emoji)]);

      closeMenu();
    });
  };

  return (
    <LexicalTypeaheadMenuPlugin<EmojiOption>
      onQueryChange={setQueryString}
      onSelectOption={onSelectOption}
      triggerFn={checkForTriggerMatch}
      options={options}
      menuRenderFn={(
        anchorElementRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex },
      ) =>
        anchorElementRef.current && options.length > 0
          ? createPortal(
              <div className="fixed z-50 min-w-[200px] max-h-[280px] overflow-y-auto rounded-md border bg-popover shadow-md">
                <ul className="py-1" role="listbox">
                  {options.map((option, index) => (
                    <li
                      key={option.key}
                      tabIndex={-1}
                      role="option"
                      aria-selected={selectedIndex === index}
                      id={`emoji-item-${index}`}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      onClick={() => {
                        setHighlightedIndex(index);
                        selectOptionAndCleanUp(option);
                      }}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 cursor-pointer",
                        selectedIndex === index
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-muted",
                      )}
                    >
                      <span className="text-xl">{option.emoji}</span>
                      <span className="text-xs text-muted-foreground">
                        {option.keywords.slice(0, 3).join(", ")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>,
              anchorElementRef.current,
            )
          : null
      }
    />
  );
}
