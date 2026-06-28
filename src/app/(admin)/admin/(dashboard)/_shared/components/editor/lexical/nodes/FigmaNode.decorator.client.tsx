"use client";

import type { ReactElement } from "react";
import { cn } from "@/shared/lib/cn";
import type { NodeKey } from "lexical";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import {
  getDecoratorStringProp,
  registerLexicalDecorator,
} from "./decorator-registry";

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

registerLexicalDecorator("figma", (props) => {
  const embedUrl = getDecoratorStringProp(props, "embedUrl");
  const label = getDecoratorStringProp(props, "label");
  const nodeKey = getDecoratorStringProp(props, "nodeKey");

  if (embedUrl === null || label === null || nodeKey === null) {
    return null;
  }

  return <FigmaComponent embedUrl={embedUrl} label={label} nodeKey={nodeKey} />;
});
