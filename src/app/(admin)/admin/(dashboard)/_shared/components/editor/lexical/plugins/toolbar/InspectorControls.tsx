"use client";

import {
  IconHelpCircle,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
  IconMaximize,
  IconMinimize,
} from "@tabler/icons-react";
import { Button } from "@/admin/components/ui/button";

type Props = {
  isInspectorAvailable: boolean;
  isInspectorExpanded: boolean;
  onToggleInspector: () => void;
  onShowShortcuts: () => void;
  isFullscreen: boolean;
  onFullscreenToggle: () => void;
};

export function InspectorControls({
  isInspectorAvailable,
  isInspectorExpanded,
  onToggleInspector,
  onShowShortcuts,
  isFullscreen,
  onFullscreenToggle,
}: Props) {
  return (
    <div
      role="group"
      aria-label="ブロック設定と表示"
      className="flex shrink-0 items-center gap-0.5 border-l border-border px-1 py-1 pl-2"
    >
      {isInspectorAvailable ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 md:h-8 md:w-8"
          aria-pressed={isInspectorExpanded}
          aria-controls="lexical-block-inspector-panel"
          aria-label={
            isInspectorExpanded
              ? "ブロック設定パネルを閉じる"
              : "ブロック設定パネルを開く（本文中のブロック用）"
          }
          onClick={onToggleInspector}
          title={
            isInspectorExpanded
              ? "ブロック設定を閉じる（Ctrl+Shift+0）"
              : "ブロック設定を開く（本文ブロック用。タイトル・SEOはヘッダの設定）Ctrl+Shift+0"
          }
        >
          {isInspectorExpanded ? (
            <IconLayoutSidebarRightCollapse className="h-5 w-5 md:h-4 md:w-4" />
          ) : (
            <IconLayoutSidebarRightExpand className="h-5 w-5 md:h-4 md:w-4" />
          )}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-10 w-10 md:h-8 md:w-8"
        onClick={onShowShortcuts}
        title="キーボードショートカット (Ctrl+Shift+/)"
      >
        <IconHelpCircle className="h-5 w-5 md:h-4 md:w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-10 w-10 md:h-8 md:w-8"
        onClick={onFullscreenToggle}
        title={isFullscreen ? "全画面終了" : "全画面表示"}
      >
        {isFullscreen ? (
          <IconMinimize className="h-5 w-5 md:h-4 md:w-4" />
        ) : (
          <IconMaximize className="h-5 w-5 md:h-4 md:w-4" />
        )}
      </Button>
    </div>
  );
}
