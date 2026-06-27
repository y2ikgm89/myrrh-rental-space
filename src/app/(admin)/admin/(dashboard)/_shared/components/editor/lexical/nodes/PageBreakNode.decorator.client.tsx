"use client";

import type { ReactElement } from "react";
import { cn } from "@/shared/lib/cn";
import type { NodeKey } from "lexical";
import {
  $getNodeByKey,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  mergeRegister,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { useEffect, useEffectEvent } from "react";
import { IconScissors } from "@tabler/icons-react";
import { registerLexicalDecorator } from "./decorator-registry";

function PageBreakComponent({ nodeKey }: { nodeKey: NodeKey }): ReactElement {
  const [editor] = useLexicalComposerContext();
  const [isSelected, setSelected, clearSelection] =
    useLexicalNodeSelection(nodeKey);

  const $onDelete = useEffectEvent((event: KeyboardEvent) => {
    event.preventDefault();
    if (isSelected && $getNodeByKey(nodeKey)) {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if (node) {
          node.remove();
        }
      });
    }
    return false;
  });

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand<MouseEvent>(
        CLICK_COMMAND,
        (event) => {
          if (!(event.target instanceof HTMLElement)) return false;
          const pageBreakElement = event.target.closest(
            `[data-lexical-page-break="${nodeKey}"]`,
          );
          if (pageBreakElement) {
            clearSelection();
            setSelected(true);
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_DELETE_COMMAND,
        (event: KeyboardEvent) => $onDelete(event),
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        (event: KeyboardEvent) => $onDelete(event),
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor, nodeKey, clearSelection, setSelected]);

  return (
    <div
      data-lexical-page-break={nodeKey}
      className={cn(
        "relative my-8 py-4 cursor-pointer border-y-2 border-dashed flex items-center justify-center text-xs select-none",
        isSelected
          ? "border-primary text-primary"
          : "border-muted-foreground/30 text-muted-foreground",
      )}
    >
      <div className="flex items-center gap-2 bg-background px-3 py-1 rounded-full">
        <IconScissors className="h-3 w-3" />
        <span>ページ区切り</span>
      </div>
    </div>
  );
}

registerLexicalDecorator("page-break", PageBreakComponent as never);
