/**
 * Font Size Plugin
 *
 * @description フォントサイズ変更機能を提供するプラグイン
 *
 * 公式Lexical Playgroundパターンに準拠
 * @see https://github.com/facebook/lexical/blob/main/packages/lexical-playground/src/plugins/ToolbarPlugin/fontSize.tsx
 */

"use client";

import { useEffect, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
  mergeRegister,
  SELECTION_CHANGE_COMMAND,
} from "lexical";
import {
  $getSelectionStyleValueForProperty,
  $patchStyleText,
} from "@lexical/selection";
import { IconMinus, IconPlus } from "@tabler/icons-react";
import { Button } from "@/admin/components/ui/button";
import { Input } from "@/admin/components/ui/input";

// =============================================================================
// Constants
// =============================================================================

const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 72;
const DEFAULT_FONT_SIZE = 16;

// フォントサイズ増減のステップ（公式Playgroundパターン）
// 48px以上: ±12px, 24-47px: ±4px, それ以外: ±1px
function calculateNextFontSize(
  currentSize: number,
  direction: "increment" | "decrement",
): number {
  let step: number;

  if (currentSize >= 48) {
    step = 12;
  } else if (currentSize >= 24) {
    step = 4;
  } else if (currentSize >= 14) {
    step = 2;
  } else {
    step = 1;
  }

  const nextSize =
    direction === "increment" ? currentSize + step : currentSize - step;

  return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, nextSize));
}

// =============================================================================
// Component
// =============================================================================

export function FontSizePlugin() {
  const [editor] = useLexicalComposerContext();
  const [fontSize, setFontSize] = useState<string>(`${DEFAULT_FONT_SIZE}`);
  const [inputValue, setInputValue] = useState<string>(`${DEFAULT_FONT_SIZE}`);

  // エディタの選択変更を監視
  useEffect(() => {
    const updateFontSize = () => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        const currentFontSize = $getSelectionStyleValueForProperty(
          selection,
          "font-size",
          `${DEFAULT_FONT_SIZE}px`,
        );
        // 'px' を除去して数値部分のみ取得
        const sizeValue = currentFontSize.replace(/px$/, "");
        setFontSize(sizeValue);
        setInputValue(sizeValue);
      }
    };

    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          updateFontSize();
        });
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateFontSize();
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    );
  }, [editor]);

  // フォントサイズを適用
  const applyFontSize = (newSize: number) => {
    const clampedSize = Math.max(
      MIN_FONT_SIZE,
      Math.min(MAX_FONT_SIZE, newSize),
    );
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $patchStyleText(selection, {
          "font-size": `${clampedSize}px`,
        });
      }
    });
    setFontSize(`${clampedSize}`);
    setInputValue(`${clampedSize}`);
  };

  // 増減ハンドラー
  const handleIncrement = () => {
    const currentSize = parseInt(fontSize, 10) || DEFAULT_FONT_SIZE;
    const nextSize = calculateNextFontSize(currentSize, "increment");
    applyFontSize(nextSize);
  };

  const handleDecrement = () => {
    const currentSize = parseInt(fontSize, 10) || DEFAULT_FONT_SIZE;
    const nextSize = calculateNextFontSize(currentSize, "decrement");
    applyFontSize(nextSize);
  };

  // 入力値変更ハンドラー
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, "");
    setInputValue(value);
  };

  // 入力確定ハンドラー
  const handleInputBlur = () => {
    const numValue = parseInt(inputValue, 10);
    if (!isNaN(numValue) && numValue > 0) {
      applyFontSize(numValue);
    } else {
      // 無効な値の場合は元に戻す
      setInputValue(fontSize);
    }
  };

  // キーボードイベントハンドラー
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleInputBlur();
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setInputValue(fontSize);
      e.currentTarget.blur();
    }
  };

  const currentSize = parseInt(fontSize, 10) || DEFAULT_FONT_SIZE;

  return (
    <div className="flex items-center gap-0.5">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={handleDecrement}
        disabled={currentSize <= MIN_FONT_SIZE}
        title="フォントサイズを小さく"
      >
        <IconMinus className="h-3 w-3" />
      </Button>
      <Input
        type="text"
        inputMode="numeric"
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleInputBlur}
        onKeyDown={handleKeyDown}
        className="h-8 w-12 px-1 text-center text-xs"
        title="フォントサイズ"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={handleIncrement}
        disabled={currentSize >= MAX_FONT_SIZE}
        title="フォントサイズを大きく"
      >
        <IconPlus className="h-3 w-3" />
      </Button>
    </div>
  );
}

// =============================================================================
// Hook for external usage
// =============================================================================

export function useFontSize() {
  const [editor] = useLexicalComposerContext();
  const [fontSize, setFontSize] = useState<number>(DEFAULT_FONT_SIZE);

  useEffect(() => {
    const updateFontSize = () => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        const currentFontSize = $getSelectionStyleValueForProperty(
          selection,
          "font-size",
          `${DEFAULT_FONT_SIZE}px`,
        );
        const sizeValue = parseInt(currentFontSize.replace(/px$/, ""), 10);
        setFontSize(isNaN(sizeValue) ? DEFAULT_FONT_SIZE : sizeValue);
      }
    };

    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        updateFontSize();
      });
    });
  }, [editor]);

  const applyFontSize = (newSize: number) => {
    const clampedSize = Math.max(
      MIN_FONT_SIZE,
      Math.min(MAX_FONT_SIZE, newSize),
    );
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $patchStyleText(selection, {
          "font-size": `${clampedSize}px`,
        });
      }
    });
  };

  return { fontSize, applyFontSize, MIN_FONT_SIZE, MAX_FONT_SIZE };
}
