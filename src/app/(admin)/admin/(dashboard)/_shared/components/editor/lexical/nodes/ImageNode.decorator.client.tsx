"use client";

import { useRef, useState, type ReactElement } from "react";
import { cn } from "@/shared/lib/cn";
import type { NodeKey } from "lexical";
import { $getNodeByKey, $setState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import {
  ImageNode,
  type ImageAlignment,
  widthState,
  heightState,
} from "./ImageNode";
import { registerLexicalDecorator } from "./decorator-registry";

const ALIGNMENT_CLASSES: Record<ImageAlignment, string> = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
};

function ImageComponent({
  src,
  alt,
  width,
  height,
  alignment = "center",
  caption,
  nodeKey,
}: {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  alignment?: ImageAlignment;
  caption?: string;
  nodeKey: NodeKey;
}): ReactElement {
  const [editor] = useLexicalComposerContext();
  const [isSelected] = useLexicalNodeSelection(nodeKey);
  const [isResizing, setIsResizing] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const startRef = useRef<{ x: number; width: number }>({ x: 0, width: 0 });

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const img = imageRef.current;
    if (!img) return;

    setIsResizing(true);
    startRef.current = { x: e.clientX, width: img.offsetWidth };

    const handleResizeMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startRef.current.x;
      const newWidth = Math.max(50, startRef.current.width + delta);
      if (img) {
        img.style.width = `${newWidth}px`;
      }
    };

    const handleResizeEnd = (upEvent: MouseEvent) => {
      document.removeEventListener("mousemove", handleResizeMove);
      document.removeEventListener("mouseup", handleResizeEnd);
      setIsResizing(false);

      const delta = upEvent.clientX - startRef.current.x;
      const newWidth = Math.max(50, startRef.current.width + delta);

      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if (node && node instanceof ImageNode) {
          $setState(node, widthState, Math.round(newWidth));
          $setState(node, heightState, undefined);
        }
      });
    };

    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);
  };

  const alignClass = ALIGNMENT_CLASSES[alignment];

  return (
    <div
      data-lexical-node-key={nodeKey}
      className={cn("relative my-6 flex", alignClass)}
    >
      <div className="relative inline-block">
        <img
          ref={imageRef}
          src={src}
          alt={alt}
          width={width}
          height={height}
          className={cn(
            "max-w-full h-auto rounded-lg",
            isSelected && "ring-2 ring-primary",
          )}
          draggable={false}
        />
        {isSelected && (
          <div
            className="absolute right-0 bottom-0 h-3 w-3 cursor-se-resize rounded-tl bg-primary"
            onMouseDown={handleResizeStart}
          />
        )}
        {isResizing && <div className="absolute inset-0 bg-primary/10" />}
      </div>
      {caption && (
        <figcaption className="text-sm text-muted-foreground text-center mt-2">
          {caption}
        </figcaption>
      )}
    </div>
  );
}

registerLexicalDecorator("image", ImageComponent as never);
