"use client";

import type { ReactElement } from "react";
import type { NodeKey } from "lexical";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { cn } from "@/shared/lib/cn";
import { CSS_VAR, CSS_VAR_CLASS } from "@/shared/lib/csp/css-vars";
import { ImperativeCssScope } from "@/shared/lib/csp/imperative-css-scope";
import {
  isInlineImagePosition,
  type InlineImagePosition,
} from "./InlineImageNode";
import {
  getDecoratorNumberProp,
  getDecoratorStringProp,
  registerLexicalDecorator,
} from "./decorator-registry";

const INLINE_IMAGE_POSITION_CLASS: Record<InlineImagePosition, string> = {
  left: "inline-block float-left mr-4 mb-2",
  right: "inline-block float-right ml-4 mb-2",
  full: "block w-full my-4",
};

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

  return (
    <ImperativeCssScope
      as="span"
      data-lexical-node-key={nodeKey}
      data-inline-image="true"
      data-position={position}
      data-width={String(width)}
      {...(position !== "full" && {
        cssVars: { [CSS_VAR.inlineImageWidth]: `${width}px` },
      })}
      className={cn(
        INLINE_IMAGE_POSITION_CLASS[position],
        position !== "full" && CSS_VAR_CLASS.inlineImageWidth,
        isSelected && "rounded ring-2 ring-primary",
      )}
    >
      <img src={src} alt={altText} className="block w-full" draggable={false} />
    </ImperativeCssScope>
  );
}

registerLexicalDecorator("inline-image", (props) => {
  const src = getDecoratorStringProp(props, "src");
  const altText = getDecoratorStringProp(props, "altText");
  const rawPosition = getDecoratorStringProp(props, "position");
  const width = getDecoratorNumberProp(props, "width");
  const nodeKey = getDecoratorStringProp(props, "nodeKey");

  if (
    src === null ||
    altText === null ||
    rawPosition === null ||
    !isInlineImagePosition(rawPosition) ||
    width === null ||
    nodeKey === null
  ) {
    return null;
  }

  return (
    <InlineImageComponent
      src={src}
      altText={altText}
      position={rawPosition}
      width={width}
      nodeKey={nodeKey}
    />
  );
});
