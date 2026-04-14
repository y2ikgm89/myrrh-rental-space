"use client";

import {
  IconBold,
  IconCode,
  IconItalic,
  IconStrikethrough,
  IconSubscript,
  IconSuperscript,
  IconUnderline,
} from "@tabler/icons-react";
import type { TextFormatType } from "lexical";
import { Button } from "@/admin/components/ui/button";

type Props = {
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  isStrikethrough: boolean;
  isSubscript: boolean;
  isSuperscript: boolean;
  isCode: boolean;
  onFormat: (format: TextFormatType) => void;
};

export function QuickFormatSection({
  isBold,
  isItalic,
  isUnderline,
  isStrikethrough,
  isSubscript,
  isSuperscript,
  isCode,
  onFormat,
}: Props) {
  return (
    <>
      <Button
        type="button"
        variant={isBold ? "secondary" : "ghost"}
        size="icon"
        className="h-8 w-8"
        onClick={() => onFormat("bold")}
        aria-label="太字"
        title="太字"
      >
        <IconBold className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant={isItalic ? "secondary" : "ghost"}
        size="icon"
        className="h-8 w-8"
        onClick={() => onFormat("italic")}
        aria-label="斜体"
        title="斜体"
      >
        <IconItalic className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant={isUnderline ? "secondary" : "ghost"}
        size="icon"
        className="h-8 w-8"
        onClick={() => onFormat("underline")}
        aria-label="下線"
        title="下線"
      >
        <IconUnderline className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant={isStrikethrough ? "secondary" : "ghost"}
        size="icon"
        className="h-8 w-8"
        onClick={() => onFormat("strikethrough")}
        aria-label="取り消し線"
        title="取り消し線"
      >
        <IconStrikethrough className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant={isSubscript ? "secondary" : "ghost"}
        size="icon"
        className="h-8 w-8"
        onClick={() => onFormat("subscript")}
        aria-label="下付き"
        title="下付き"
      >
        <IconSubscript className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant={isSuperscript ? "secondary" : "ghost"}
        size="icon"
        className="h-8 w-8"
        onClick={() => onFormat("superscript")}
        aria-label="上付き"
        title="上付き"
      >
        <IconSuperscript className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant={isCode ? "secondary" : "ghost"}
        size="icon"
        className="h-8 w-8"
        onClick={() => onFormat("code")}
        aria-label="コード"
        title="コード"
      >
        <IconCode className="h-4 w-4" />
      </Button>
    </>
  );
}
