/**
 * Spotify Node
 *
 * @description Spotify の音楽・Podcast 埋め込みを表示する DecoratorNode
 * server / headless でも import 可能。編集 UI は SpotifyNode.decorator.client。
 */

import type { ReactElement } from "react";
import type {
  DOMConversionMap,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
} from "lexical";
import {
  $create,
  $getState,
  $setState,
  createState,
  DecoratorNode,
} from "lexical";
import { createEnumGuard, parseString } from "../config/type-guards";
import { renderLexicalDecorator } from "./decorator-registry";

export type SpotifyContentType =
  | "track"
  | "album"
  | "playlist"
  | "episode"
  | "show";

const SPOTIFY_CONTENT_TYPES: readonly SpotifyContentType[] = [
  "track",
  "album",
  "playlist",
  "episode",
  "show",
] as const;

export const isSpotifyContentType = createEnumGuard<SpotifyContentType>(
  SPOTIFY_CONTENT_TYPES,
);

export function toSpotifyEmbedUrl(
  url: string,
): { embedUrl: string; contentType: SpotifyContentType } | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("spotify.com")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    const typeIndex = parts.findIndex((p) => isSpotifyContentType(p));
    if (typeIndex === -1) return null;
    const id = parts[typeIndex + 1];
    if (!id) return null;
    const rawType = parts[typeIndex];
    if (!rawType || !isSpotifyContentType(rawType)) return null;
    return {
      embedUrl: `https://open.spotify.com/embed/${rawType}/${id}`,
      contentType: rawType,
    };
  } catch {
    return null;
  }
}

export const spotifyEmbedUrlState = createState("embedUrl", {
  parse: parseString,
});

export const spotifyContentTypeState = createState("contentType", {
  parse: (v: unknown): SpotifyContentType =>
    typeof v === "string" && isSpotifyContentType(v) ? v : "track",
});

export class SpotifyNode extends DecoratorNode<ReactElement | null> {
  override $config() {
    return this.config("spotify", {
      extends: DecoratorNode,
      stateConfigs: [
        { flat: true, stateConfig: spotifyEmbedUrlState },
        { flat: true, stateConfig: spotifyContentTypeState },
      ],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      div: (domNode) => {
        if (
          !(domNode instanceof HTMLElement) ||
          !domNode.hasAttribute("data-spotify")
        )
          return null;
        return {
          conversion: (element) => {
            const iframe = element.querySelector("iframe");
            const rawType = element.getAttribute("data-spotify-type") ?? "";
            const node = $createSpotifyNode({
              embedUrl: iframe?.getAttribute("src") ?? "",
              contentType: isSpotifyContentType(rawType) ? rawType : "track",
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
    div.setAttribute("data-lexical-spotify", "true");
    return div;
  }

  override updateDOM(): false {
    return false;
  }

  override exportDOM(): DOMExportOutput {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-spotify", "true");
    wrapper.setAttribute(
      "data-spotify-type",
      $getState(this, spotifyContentTypeState),
    );
    const iframe = document.createElement("iframe");
    iframe.setAttribute("src", $getState(this, spotifyEmbedUrlState));
    iframe.setAttribute("allow", "encrypted-media");
    iframe.setAttribute("loading", "lazy");
    wrapper.appendChild(iframe);
    return { element: wrapper };
  }

  override decorate(): ReactElement | null {
    return renderLexicalDecorator("spotify", {
      embedUrl: $getState(this, spotifyEmbedUrlState),
      contentType: $getState(this, spotifyContentTypeState),
      nodeKey: this.getKey(),
    });
  }
}

/**
 * SpotifyNode を作成する
 *
 * @param params - Spotify 埋め込みパラメータ
 * @returns SpotifyNode インスタンス
 */
export function $createSpotifyNode(params: {
  embedUrl: string;
  contentType: SpotifyContentType;
}): SpotifyNode {
  const node = $create(SpotifyNode);
  $setState(node, spotifyEmbedUrlState, params.embedUrl);
  $setState(node, spotifyContentTypeState, params.contentType);
  return node;
}

/**
 * ノードが SpotifyNode かどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns SpotifyNode の場合 true
 */
export function $isSpotifyNode(
  node: LexicalNode | null | undefined,
): node is SpotifyNode {
  return node instanceof SpotifyNode;
}
