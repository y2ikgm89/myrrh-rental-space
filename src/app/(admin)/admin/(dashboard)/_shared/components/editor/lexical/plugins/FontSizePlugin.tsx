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
import { Toolbar } from "radix-ui";
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

  // 委譲先の増減ボタンが「現在すでに disabled か」「blur 確定後に新たに
  // disabled 化されるか」を判定する
  //
  // PR#1351 フォローアップ（Codexレビュー指摘, スレッド
  // PRRT_kwDOQ0jEts6ShRqe）: handleKeyDown が境界（先頭/末尾）で Radix の
  // ロービングフォーカスへ委譲すると、隣接する増減ボタンへ同期的に
  // フォーカスが移る。しかしこの時点の disabled 判定はまだ blur で確定
  // していない `fontSize` state を基準にしている。たとえば MAX を超える
  // `72` を入力し末尾で ArrowRight を押すと、増加ボタンは古い `fontSize`
  // 基準ではまだ enabled と判定され、Radix はそこへフォーカスを移す。
  // フォーカス移動が引き起こす input の blur で値が境界値へ clamp
  // されると、フォーカス移動済みのそのボタンが直後に disabled 化される。
  // HTML 仕様上 disabled 要素はフォーカスを保持できないため、フォーカスは
  // 失われ以降の矢印キー操作が継続できなくなる。
  //
  // 対策として、委譲する前に「blur 相当で確定するであろう値」を
  // inputValue から先読みし、その値で委譲先ボタンが disabled になると
  // 判明した場合は委譲自体を行わない（handleKeyDown 側で preventDefault
  // してキャレットをその場に留める）。React の state を同期的に flush
  // する手段（`flushSync`）はこのリポジトリの ESLint ルール
  // `@eslint-react/dom-no-flush-sync` で禁止されているため使わない。
  //
  // PR#1355 再フォローアップ（Codexレビュー指摘, スレッド
  // PRRT_kwDOQ0jEts6Sin1U）: 上記ガードは「これから disabled になる
  // （enabled → disabled の遷移）」だけでなく「値が確定済みで既に
  // disabled な定常状態（例: 既に 72 の状態で末尾 ArrowRight）」でも
  // 誤って preventDefault してしまい、Radix のロービングフォーカスが
  // 本来持つ「disabled 項目を自動的に読み飛ばして隣の有効な項目へ移る」
  // 挙動を妨げ、逆に input 内へフォーカスを閉じ込めてしまっていた。
  // 定常的に disabled な項目は Radix にそのまま委譲すれば安全に読み
  // 飛ばされるため、ガードは「現在は enabled だが、この操作の確定に
  // よって新たに disabled化される」という遷移が起きる場合に限定する
  // 必要がある。`isAdjacentButtonCurrentlyDisabled` で実際にボタンの
  // `disabled` prop を決めている committed `fontSize`（inputValue では
  // ない）を基準に現在の disabled 状態を判定し、
  // `willAdjacentButtonBecomeDisabled` の判定と組み合わせて遷移
  // ケースのみを検出する。
  const isAdjacentButtonCurrentlyDisabled = (
    direction: "increment" | "decrement",
  ): boolean => {
    const currentSize = parseInt(fontSize, 10) || DEFAULT_FONT_SIZE;
    return direction === "increment"
      ? currentSize >= MAX_FONT_SIZE
      : currentSize <= MIN_FONT_SIZE;
  };

  const willAdjacentButtonBecomeDisabled = (
    direction: "increment" | "decrement",
  ): boolean => {
    const parsed = parseInt(inputValue, 10);
    // 無効値（空・0以下・NaN）は blur 時に現在の fontSize へ戻るだけなので、
    // 確定後の値も現在の committed size と同じになる
    const pendingSize =
      !isNaN(parsed) && parsed > 0
        ? Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, parsed))
        : parseInt(fontSize, 10) || DEFAULT_FONT_SIZE;
    return direction === "increment"
      ? pendingSize >= MAX_FONT_SIZE
      : pendingSize <= MIN_FONT_SIZE;
  };

  // 「今は enabled だが、この操作の確定で新たに disabled になる」遷移
  // ケースだけを真とする。既に disabled な定常状態では false を返し、
  // Radix への委譲（= disabled 項目の自動読み飛ばし）を妨げない。
  const shouldTrapFocusToAvoidDisabledHandoff = (
    direction: "increment" | "decrement",
  ): boolean =>
    !isAdjacentButtonCurrentlyDisabled(direction) &&
    willAdjacentButtonBecomeDisabled(direction);

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
  //
  // PR#1342 フォローアップ（Codexレビュー指摘, スレッド
  // PRRT_kwDOQ0jEts6SfWgO）: この input は Toolbar.Button asChild で
  // ロービングフォーカスグループの単一 Tab ストップに参加する（下記 JSX）。
  // ArrowLeft/ArrowRight/Home/End は、テキスト境界にいない限りキャレット
  // 移動として自前で処理してから preventDefault する。RovingFocusGroupItem
  // 内部の矢印キー処理は composeEventHandlers 経由で
  // event.defaultPrevented を見てから実行されるため、preventDefault する
  // と Radix 側のロービング移動（隣接ボタンへのフォーカス移動）は実行され
  // ない（実ブラウザで動作検証済み。radix-ui@1.6.0 /
  // @radix-ui/react-toolbar@1.1.13 / @radix-ui/react-roving-focus@1.1.13）。
  // テキスト先頭で ArrowLeft・末尾で ArrowRight を押した場合のみ
  // preventDefault せず Radix 側へ委譲し、隣接ボタンへ抜けられるようにする。
  // Shift/Ctrl/Alt/Meta 修飾時は Radix 側の矢印キー処理自体が元々スキップ
  // するため何もしない（選択範囲拡張・単語単位移動は素通しでネイティブ
  // 挙動のまま）。Home/End は常にテキストフィールド内の移動として扱い
  // ロービンググループへは委譲しない（テキスト入力の慣習的挙動を優先。
  // WAI-ARIA APG toolbar パターンの Home/End はロービング対象としては
  // Optional 扱い）。
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleInputBlur();
      e.currentTarget.blur();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setInputValue(fontSize);
      e.currentTarget.blur();
      return;
    }

    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) {
      return;
    }

    const input = e.currentTarget;
    const selectionStart = input.selectionStart ?? 0;
    const selectionEnd = input.selectionEnd ?? 0;

    if (e.key === "ArrowLeft") {
      if (selectionStart === 0 && selectionEnd === 0) {
        if (shouldTrapFocusToAvoidDisabledHandoff("decrement")) {
          // 委譲すると blur で直後に disabled 化される減少ボタンへ
          // フォーカスが移ってしまうため、委譲せずキャレットをその場に
          // 留める（enabled→disabled の遷移ケースのみ。既に disabled な
          // 定常状態では下の return で通常通り Radix に委譲し、disabled
          // 項目の自動読み飛ばしに任せる。上記コメント参照）
          e.preventDefault();
          return;
        }
        return; // テキスト先頭: Radix のロービング移動へ委譲
      }
      e.preventDefault();
      const collapsed = Math.min(selectionStart, selectionEnd);
      const next = selectionStart !== selectionEnd ? collapsed : collapsed - 1;
      input.setSelectionRange(next, next);
    } else if (e.key === "ArrowRight") {
      if (
        selectionStart === input.value.length &&
        selectionEnd === input.value.length
      ) {
        if (shouldTrapFocusToAvoidDisabledHandoff("increment")) {
          // 委譲すると blur で直後に disabled 化される増加ボタンへ
          // フォーカスが移ってしまうため、委譲せずキャレットをその場に
          // 留める（enabled→disabled の遷移ケースのみ。既に disabled な
          // 定常状態では下の return で通常通り Radix に委譲し、disabled
          // 項目の自動読み飛ばしに任せる。上記コメント参照）
          e.preventDefault();
          return;
        }
        return; // テキスト末尾: Radix のロービング移動へ委譲
      }
      e.preventDefault();
      const collapsed = Math.max(selectionStart, selectionEnd);
      const next = selectionStart !== selectionEnd ? collapsed : collapsed + 1;
      input.setSelectionRange(next, next);
    } else if (e.key === "Home") {
      e.preventDefault();
      input.setSelectionRange(0, 0);
    } else if (e.key === "End") {
      e.preventDefault();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  };

  const currentSize = parseInt(fontSize, 10) || DEFAULT_FONT_SIZE;

  return (
    <div className="flex items-center gap-0.5">
      <Toolbar.Button asChild disabled={currentSize <= MIN_FONT_SIZE}>
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
      </Toolbar.Button>
      {/* 自由入力の text input。Toolbar.Button asChild でラップし、
          ロービングフォーカスグループの単一 Tab ストップとして参加させる
          （矢印キーのキャレット移動は上記 handleKeyDown で自前実装し、
          テキスト境界でのみ Radix 側の移動に委譲する） */}
      <Toolbar.Button asChild>
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
      </Toolbar.Button>
      <Toolbar.Button asChild disabled={currentSize >= MAX_FONT_SIZE}>
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
      </Toolbar.Button>
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
