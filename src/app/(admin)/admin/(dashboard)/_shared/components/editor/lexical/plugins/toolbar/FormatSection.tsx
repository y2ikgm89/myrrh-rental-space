"use client";

import {
  IconBold,
  IconItalic,
  IconStrikethrough,
  IconSubscript,
  IconSuperscript,
  IconUnderline,
} from "@tabler/icons-react";
import { Button } from "@/admin/components/ui/button";

type Props = {
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  isStrikethrough: boolean;
  isSubscript: boolean;
  isSuperscript: boolean;
  onBold: () => void;
  onItalic: () => void;
  onUnderline: () => void;
  onStrikethrough: () => void;
  onSubscript: () => void;
  onSuperscript: () => void;
};

export function FormatSection({
  isBold,
  isItalic,
  isUnderline,
  isStrikethrough,
  isSubscript,
  isSuperscript,
  onBold,
  onItalic,
  onUnderline,
  onStrikethrough,
  onSubscript,
  onSuperscript,
}: Props) {
  return (
    <>
      <Button
        type="button"
        variant={isBold ? "secondary" : "ghost"}
        size="icon"
        className="h-10 w-10 md:h-8 md:w-8"
        onClick={onBold}
        title="太字"
      >
        <IconBold className="h-5 w-5 md:h-4 md:w-4" />
      </Button>
      <Button
        type="button"
        variant={isItalic ? "secondary" : "ghost"}
        size="icon"
        className="h-10 w-10 md:h-8 md:w-8"
        onClick={onItalic}
        title="斜体"
      >
        <IconItalic className="h-5 w-5 md:h-4 md:w-4" />
      </Button>
      <Button
        type="button"
        variant={isUnderline ? "secondary" : "ghost"}
        size="icon"
        className="h-10 w-10 md:h-8 md:w-8"
        onClick={onUnderline}
        title="下線"
      >
        <IconUnderline className="h-5 w-5 md:h-4 md:w-4" />
      </Button>
      <Button
        type="button"
        variant={isStrikethrough ? "secondary" : "ghost"}
        size="icon"
        className="h-10 w-10 md:h-8 md:w-8"
        onClick={onStrikethrough}
        title="取り消し線"
      >
        <IconStrikethrough className="h-5 w-5 md:h-4 md:w-4" />
      </Button>
      <Button
        type="button"
        variant={isSubscript ? "secondary" : "ghost"}
        size="icon"
        className="h-10 w-10 md:h-8 md:w-8"
        onClick={onSubscript}
        title="下付き文字"
      >
        <IconSubscript className="h-5 w-5 md:h-4 md:w-4" />
      </Button>
      <Button
        type="button"
        variant={isSuperscript ? "secondary" : "ghost"}
        size="icon"
        className="h-10 w-10 md:h-8 md:w-8"
        onClick={onSuperscript}
        title="上付き文字"
      >
        <IconSuperscript className="h-5 w-5 md:h-4 md:w-4" />
      </Button>
    </>
  );
}
