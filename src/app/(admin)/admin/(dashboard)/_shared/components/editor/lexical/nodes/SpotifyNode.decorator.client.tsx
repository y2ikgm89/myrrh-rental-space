"use client";

import type { ReactElement } from "react";
import { cn } from "@/shared/lib/cn";
import type { NodeKey } from "lexical";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { isSpotifyContentType, type SpotifyContentType } from "./SpotifyNode";
import {
  getDecoratorStringProp,
  registerLexicalDecorator,
} from "./decorator-registry";

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

registerLexicalDecorator("spotify", (props) => {
  const embedUrl = getDecoratorStringProp(props, "embedUrl");
  const rawContentType = getDecoratorStringProp(props, "contentType");
  const nodeKey = getDecoratorStringProp(props, "nodeKey");

  if (
    embedUrl === null ||
    rawContentType === null ||
    !isSpotifyContentType(rawContentType) ||
    nodeKey === null
  ) {
    return null;
  }

  return (
    <SpotifyComponent
      embedUrl={embedUrl}
      contentType={rawContentType}
      nodeKey={nodeKey}
    />
  );
});
