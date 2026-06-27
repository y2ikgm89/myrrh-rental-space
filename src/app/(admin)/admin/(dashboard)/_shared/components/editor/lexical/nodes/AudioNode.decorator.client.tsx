"use client";

import type { ReactElement } from "react";
import { cn } from "@/shared/lib/cn";
import type { NodeKey } from "lexical";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { registerLexicalDecorator } from "./decorator-registry";

function AudioComponent({
  url,
  title,
  artist,
  nodeKey,
}: {
  url: string;
  title: string;
  artist: string;
  nodeKey: NodeKey;
}): ReactElement {
  const [isSelected, setSelected] = useLexicalNodeSelection(nodeKey);

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4 my-2",
        isSelected && "ring-2 ring-ring",
      )}
      onClick={(e) => {
        if (e.target instanceof HTMLAudioElement) return;
        setSelected(true);
      }}
    >
      {(title || artist) && (
        <div className="mb-2">
          {title && (
            <p className="text-sm font-medium text-foreground">{title}</p>
          )}
          {artist && <p className="text-xs text-muted-foreground">{artist}</p>}
        </div>
      )}
      <audio src={url} controls preload="metadata" className="w-full" />
    </div>
  );
}

registerLexicalDecorator("audio", AudioComponent as never);
