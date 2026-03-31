/**
 * カラムレイアウト選択時のツールバー（デスクトップ／狭い画面の列プリセット）
 */

"use client";

import { IconCheck, IconChevronDown, IconLayoutGrid } from "@tabler/icons-react";
import { $getNodeByKey, $setState, type LexicalEditor } from "lexical";
import { Button } from "@/admin/components/ui/button";
import { Separator } from "@/admin/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/admin/components/ui/dropdown-menu";
import {
  LAYOUT_BREAKPOINT_MAX_PX,
  LAYOUT_NARROW_TEMPLATES,
  LAYOUT_TEMPLATES,
} from "../config/layout-templates";
import {
  $isLayoutContainerNode,
  templateColumnsNarrowState,
  templateColumnsState,
} from "../nodes/LayoutContainerNode";

export type LayoutToolbarContext = {
  nodeKey: string;
  wide: string;
  narrow: string;
};

type LayoutToolbarSectionProps = {
  editor: LexicalEditor;
  context: LayoutToolbarContext | null;
};

export function LayoutToolbarSection({
  editor,
  context,
}: LayoutToolbarSectionProps) {
  if (context === null) {
    return null;
  }

  const applyWide = (value: string) => {
    editor.update(() => {
      const node = $getNodeByKey(context.nodeKey);
      if (!$isLayoutContainerNode(node)) return;
      $setState(node, templateColumnsState, value);
    });
  };

  const applyNarrow = (value: string) => {
    editor.update(() => {
      const node = $getNodeByKey(context.nodeKey);
      if (!$isLayoutContainerNode(node)) return;
      $setState(node, templateColumnsNarrowState, value);
    });
  };

  return (
    <>
      <Separator orientation="vertical" className="mx-1 h-6" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-8 gap-1 max-w-[140px]"
            title="カラムレイアウト（選択中のブロック内）"
          >
            <IconLayoutGrid className="h-4 w-4 shrink-0" />
            <span className="truncate text-xs">カラム</span>
            <IconChevronDown className="h-3 w-3 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[220px]">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>広い画面（既定）</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-[min(70vh,360px)] overflow-y-auto">
              {LAYOUT_TEMPLATES.map((t) => (
                <DropdownMenuItem
                  key={t.value}
                  onClick={() => applyWide(t.value)}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{t.label}</span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {t.description}
                    </span>
                  </span>
                  {context.wide === t.value ? (
                    <IconCheck className="h-4 w-4 shrink-0 text-primary" />
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              狭い画面（〜{LAYOUT_BREAKPOINT_MAX_PX}px）
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {LAYOUT_NARROW_TEMPLATES.map((t) => (
                <DropdownMenuItem
                  key={t.value}
                  onClick={() => applyNarrow(t.value)}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{t.label}</span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {t.description}
                    </span>
                  </span>
                  {context.narrow === t.value ? (
                    <IconCheck className="h-4 w-4 shrink-0 text-primary" />
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <div className="text-muted-foreground px-2 py-1.5 text-xs leading-snug">
            本文中のカラムブロックにキャレットがあるときに表示されます。ブロック設定パネルでも同じ項目を編集できます。
            列を減らすと右端の内容は最終列にマージされます。挿入はキャレット位置に従い、カラム内にネストすることもあります。
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
