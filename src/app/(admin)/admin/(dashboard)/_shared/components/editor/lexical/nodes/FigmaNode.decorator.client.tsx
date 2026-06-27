"use client";

import type { ReactElement } from "react";
import { cn } from "@/shared/lib/cn";
import type { NodeKey } from "lexical";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { registerLexicalDecorator } from "./decorator-registry";

function FigmaComponent({
  embedUrl,
  label,
  nodeKey,
}: {
  embedUrl: string;
  label: string;
  nodeKey: NodeKey;
}): ReactElement {
  const [isSelected, setSelected] = useLexicalNodeSelection(nodeKey);

  return (
    <div
      className={cn(
        "rounded-lg border border-border overflow-hidden my-2",
        isSelected && "ring-2 ring-ring",
      )}
      onClick={() => setSelected(true)}
    >
      {label && (
        <p className="text-sm text-muted-foreground px-3 py-1 border-b border-border bg-muted">
          {label}
        </p>
      )}
      <iframe
        src={embedUrl}
        allow="fullscreen"
        loading="lazy"
        title={label || "Figma デザイン"}
        className="w-full border-none"
        style={{ height: "450px" }}
      />
    </div>
  );
}

registerLexicalDecorator("figma", FigmaComponent as never);
