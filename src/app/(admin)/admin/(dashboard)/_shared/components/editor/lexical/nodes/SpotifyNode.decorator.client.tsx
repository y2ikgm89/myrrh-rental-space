"use client";

import type { ReactElement } from "react";
import { cn } from "@/shared/lib/cn";
import type { NodeKey } from "lexical";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { type SpotifyContentType } from "./SpotifyNode";
import { registerLexicalDecorator } from "./decorator-registry";

const CONTENT_TYPE_LABELS: Record<SpotifyContentType, string> = {
  track: "トラック",
  album: "アルバム",
  playlist: "プレイリスト",
  episode: "エピソード",
  show: "ポッドキャスト",
};

function SpotifyComponent({
  embedUrl,
  contentType,
  nodeKey,
}: {
  embedUrl: string;
  contentType: SpotifyContentType;
  nodeKey: NodeKey;
}): ReactElement {
  const [isSelected, setSelected] = useLexicalNodeSelection(nodeKey);

  return (
    <div
      className={cn("my-2", isSelected && "ring-2 ring-ring rounded-xl")}
      onClick={() => setSelected(true)}
    >
      <iframe
        src={embedUrl}
        allow="encrypted-media"
        loading="lazy"
        title={`Spotify ${CONTENT_TYPE_LABELS[contentType]}`}
        className="h-[352px] w-full border-none rounded-xl"
      />
    </div>
  );
}

registerLexicalDecorator("spotify", SpotifyComponent as never);
