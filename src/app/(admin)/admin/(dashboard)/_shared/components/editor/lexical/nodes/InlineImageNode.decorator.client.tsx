"use client";

import type { ReactElement } from "react";
import type { NodeKey } from "lexical";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { type InlineImagePosition } from "./InlineImageNode";
import { registerLexicalDecorator } from "./decorator-registry";

function InlineImageComponent({
  src,
  altText,
  position,
  width,
  nodeKey,
}: {
  src: string;
  altText: string;
  position: InlineImagePosition;
  width: number;
  nodeKey: NodeKey;
}): ReactElement {
  const [isSelected] = useLexicalNodeSelection(nodeKey);

  const floatStyle: React.CSSProperties =
    position === "left"
      ? { float: "left", marginRight: "1rem", marginBottom: "0.5rem" }
      : position === "right"
        ? { float: "right", marginLeft: "1rem", marginBottom: "0.5rem" }
        : {};

  const containerStyle: React.CSSProperties = {
    display: "inline-block",
    width: position !== "full" ? width : undefined,
    ...floatStyle,
  };

  return (
    <span
      data-lexical-node-key={nodeKey}
      style={containerStyle}
      className={isSelected ? "ring-2 ring-primary rounded" : ""}
    >
      <img
        src={src}
        alt={altText}
        style={{ width: "100%", display: "block" }}
        draggable={false}
      />
    </span>
  );
}

registerLexicalDecorator("inline-image", InlineImageComponent as never);
