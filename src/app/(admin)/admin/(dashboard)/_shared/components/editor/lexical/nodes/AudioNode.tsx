/**
 * Audio Node
 *
 * @description 音声プレイヤーを埋め込むDecoratorNode
 */

"use client";

import type { ReactElement } from "react";
import type {
  DOMConversionMap,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
} from "lexical";
import {
  $create,
  $getState,
  $setState,
  createState,
  DecoratorNode,
} from "lexical";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { parseString } from "../config/type-guards";

// =============================================================================
// State
// =============================================================================

export const audioUrlState = createState("url", {
  parse: parseString,
});

export const audioTitleState = createState("title", {
  parse: parseString,
});

export const audioArtistState = createState("artist", {
  parse: parseString,
});

// =============================================================================
// Component
// =============================================================================

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
}) {
  const [isSelected, setSelected] = useLexicalNodeSelection(nodeKey);

  return (
    <div
      className={`rounded-lg border bg-card p-4 my-2 ${isSelected ? "ring-2 ring-ring" : ""}`}
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

// =============================================================================
// Node Class
// =============================================================================

export class AudioNode extends DecoratorNode<ReactElement> {
  override $config() {
    return this.config("audio", {
      extends: DecoratorNode,
      stateConfigs: [
        { flat: true, stateConfig: audioUrlState },
        { flat: true, stateConfig: audioTitleState },
        { flat: true, stateConfig: audioArtistState },
      ],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      div: (domNode) => {
        if (
          !(domNode instanceof HTMLElement) ||
          !domNode.hasAttribute("data-audio")
        )
          return null;
        return {
          conversion: (element) => {
            const audio = element.querySelector("audio");
            const node = $createAudioNode({
              url: audio?.getAttribute("src") ?? "",
              title: element.getAttribute("data-audio-title") ?? "",
              artist: element.getAttribute("data-audio-artist") ?? "",
            });
            return { node };
          },
          priority: 2,
        };
      },
    };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement("div");
    div.setAttribute("data-lexical-audio", "true");
    return div;
  }

  override updateDOM(): false {
    return false;
  }

  override exportDOM(): DOMExportOutput {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-audio", "true");
    wrapper.setAttribute("data-audio-title", $getState(this, audioTitleState));
    wrapper.setAttribute(
      "data-audio-artist",
      $getState(this, audioArtistState),
    );
    const audio = document.createElement("audio");
    audio.setAttribute("src", $getState(this, audioUrlState));
    audio.setAttribute("controls", "");
    audio.setAttribute("preload", "metadata");
    wrapper.appendChild(audio);
    return { element: wrapper };
  }

  override decorate(): ReactElement {
    return (
      <AudioComponent
        url={$getState(this, audioUrlState)}
        title={$getState(this, audioTitleState)}
        artist={$getState(this, audioArtistState)}
        nodeKey={this.getKey()}
      />
    );
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * AudioNodeを作成する
 *
 * @param params - 音声のパラメータ
 * @returns AudioNode インスタンス
 */
export function $createAudioNode(params: {
  url: string;
  title?: string;
  artist?: string;
}): AudioNode {
  const node = $create(AudioNode);
  $setState(node, audioUrlState, params.url);
  $setState(node, audioTitleState, params.title ?? "");
  $setState(node, audioArtistState, params.artist ?? "");
  return node;
}

/**
 * ノードがAudioNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns AudioNodeの場合true
 */
export function $isAudioNode(
  node: LexicalNode | null | undefined,
): node is AudioNode {
  return node instanceof AudioNode;
}
