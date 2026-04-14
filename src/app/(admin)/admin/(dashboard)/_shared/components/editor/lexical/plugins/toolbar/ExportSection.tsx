"use client";

import {
  IconAlignLeft,
  IconChevronDown,
  IconCode,
  IconFileDownload,
  IconFileText,
  IconPrinter,
  IconUpload,
} from "@tabler/icons-react";
import { Button } from "@/admin/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/admin/components/ui/dropdown-menu";

type Props = {
  onCopyMarkdown: () => void;
  onCopyHtml: () => void;
  onCopyPlainText: () => void;
  onMarkdownImport: () => void;
  onOpenPrintPreview: () => void;
};

export function ExportSection({
  onCopyMarkdown,
  onCopyHtml,
  onCopyPlainText,
  onMarkdownImport,
  onOpenPrintPreview,
}: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1">
          <IconFileDownload className="h-4 w-4" />
          <span className="text-xs">書き出し</span>
          <IconChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[200px]">
        <DropdownMenuItem
          onClick={onCopyMarkdown}
          className="flex items-center gap-2"
        >
          <IconFileText className="h-4 w-4" />
          <span>Markdown をコピー</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onCopyHtml}
          className="flex items-center gap-2"
        >
          <IconCode className="h-4 w-4" />
          <span>HTML をコピー</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onCopyPlainText}
          className="flex items-center gap-2"
        >
          <IconAlignLeft className="h-4 w-4" />
          <span>プレーンテキストをコピー</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onMarkdownImport}
          className="flex items-center gap-2"
        >
          <IconUpload className="h-4 w-4" />
          <span>Markdown をインポート</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onOpenPrintPreview}
          className="flex items-center gap-2"
        >
          <IconPrinter className="h-4 w-4" />
          <span>印刷プレビュー</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
